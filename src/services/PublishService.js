// src/services/PublishService.js
import { getDb } from "../db/mongo.js";
import { AutoPickerService, isPickForDate } from "./AutoPickerService.js";
import { isTradingDayIST } from "../utils/holidays.js";
import { toIST, toISTDateKey } from "../utils/time.js";

/**
 * Decide which symbols to publish from the latest pick doc.
 * Prefers top5 (when available); falls back to shortlisted.
 */
function pickSymbolsFromDoc(doc, { minCount = 5, maxCount = 10 } = {}) {
  let base = [];

  if (Array.isArray(doc.top5) && doc.top5.length) {
    base = doc.top5.map((x) => x.symbol);
  } else if (Array.isArray(doc.shortlisted) && doc.shortlisted.length) {
    base = doc.shortlisted.map((x) => x.symbol);
  }

  const deduped = Array.from(new Set(base));
  const want = Math.min(
    Math.max(minCount, 0),
    Math.max(maxCount, deduped.length || 0)
  );
  return deduped.slice(0, want);
}

/**
 * Publishes the final list of tradable symbols to Mongo:
 *   Collection: top_stock_symbols
 *   Doc key:   <YYYY-MM-DD-IST>:<source>
 *   Field:     symbols: ["NSE:RELIANCE", "NSE:HAL", ...]
 *
 * Locking: avoids rewriting inside lockMinutes to keep the list stable.
 */
// 2) do not lock empty results; allow force override
export async function publishFinalList({
  minCount = 5,
  maxCount = 10,
  source = "preopen",
  lockMinutes = 20,
  force = true, // <--- new
} = {}) {
  if (!isTradingDayIST(new Date())) {
    return { ok: false, reason: "market_holiday" };
  }

  const todayKey = toISTDateKey(new Date());
  let latest = await AutoPickerService.getLatest?.();

  const needsFreshRun =
    !isPickForDate(latest, todayKey) || (latest?.filteredSize ?? 0) === 0;

  if (needsFreshRun && typeof AutoPickerService.run === "function") {
    await AutoPickerService.run({ debug: false });
    latest = await AutoPickerService.getLatest?.();
  }

  if (!latest) throw new Error("no_pick_available");
  if (!isPickForDate(latest, todayKey)) {
    throw new Error("no_pick_for_today");
  }

  const db = await getDb();
  const _id = `${todayKey}:${source}`;

  // respect lock unless forced
  const existing = await db.collection("top_stock_symbols").findOne({ _id });
  if (
    !force &&
    existing &&
    existing.lockUntil &&
    new Date(existing.lockUntil).getTime() > Date.now()
  ) {
    return {
      ok: true,
      locked: true,
      _id,
      symbols: existing.symbols || [],
      lockUntil: existing.lockUntil,
      note: "existing list still locked; not overwritten",
    };
  }

  const symbols = pickSymbolsFromDocFlexible(latest, { minCount, maxCount });

  // 👇 don’t lock an empty list — just return and let the next run try again
  if (symbols.length === 0) {
    await db.collection("top_stock_symbols").updateOne(
      { _id },
      {
        $set: {
          _id,
          date: todayKey,
          createdAtIST: toIST(new Date()),
          source,
          symbols: [],
          meta: {
            pickId: latest._id,
            universeSize: latest.universeSize || 0,
            shortlistedCount: latest.shortlisted?.length || 0,
            filteredSize: latest.filteredSize || 0,
            rules: latest.rules || {},
          },
        },
        $unset: { lockUntil: "" }, // <-- do not keep a lock on empty
      },
      { upsert: true }
    );
    return { ok: true, _id, count: 0, symbols: [] };
  }

  const lockUntilISO = new Date(
    Date.now() + lockMinutes * 60_000
  ).toISOString();
  const payload = {
    _id,
    date: todayKey,
    createdAtIST: toIST(new Date()),
    lockUntil: lockUntilISO,
    source,
    symbols,
    meta: {
      pickId: latest._id,
      universeSize: latest.universeSize || 0,
      shortlistedCount: latest.shortlisted?.length || 0,
      filteredSize: latest.filteredSize || 0,
      rules: latest.rules || {},
    },
  };

  await db
    .collection("top_stock_symbols")
    .updateOne({ _id }, { $set: payload }, { upsert: true });

  return {
    ok: true,
    _id,
    count: symbols.length,
    symbols,
    lockUntil: lockUntilISO,
  };
}

/**
 * Wrapper expected by scheduler:
 * - Calls publishFinalList to compute symbols for today
 * - Appends them into the existing single doc in `stock_symbols.symbols`
 *   without creating a new document and without removing old symbols.
 */
export async function publishTopSymbols(opts = {}) {
  const res = await publishFinalList(opts);
  if (!res.ok || !Array.isArray(res.symbols)) return res;

  const db = await getDb(); // <-- await here
  const coll = db.collection("stock_symbols");

  // Append uniquely to the single existing document; do not upsert a new one.
  const upd = await coll.updateOne(
    {},
    { $addToSet: { symbols: { $each: res.symbols } } },
    { upsert: false }
  );

  if (upd.matchedCount === 0) {
    // Optional: log if there's no base doc
    console.warn(
      "[publishTopSymbols] No existing stock_symbols document found. " +
        "Create one once: db.stock_symbols.insertOne({ symbols: [] })"
    );
  }

  return { ...res, appendedToStockSymbols: upd.modifiedCount > 0 };
}

/** Exported alias so scheduler can import it directly */
export function symbolsFromPickDoc(doc, opts = {}) {
  return pickSymbolsFromDoc(doc, opts);
}

// 1) tolerant extractor
function pickSymbolsFromDocFlexible(doc, { minCount = 5, maxCount = 10 } = {}) {
  if (!doc || typeof doc !== "object") return [];

  // collect from multiple likely fields
  const pools = [
    doc.top5,
    doc.final, // if you store final picks here
    doc.finalized, // sometimes used
    doc.shortlisted,
    doc.picks, // any generic list
  ].filter(Boolean);

  const out = [];
  for (const arr of pools) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      // support different shapes
      if (typeof item === "string") out.push(item);
      else if (item && typeof item === "object") {
        out.push(
          item.symbol ||
            item.tradingsymbol ||
            item.ts ||
            (item.exchange && item.ticker
              ? `${item.exchange}:${item.ticker}`
              : null)
        );
      }
    }
  }

  // cleanup: only truthy strings, normalize like "NSE:XYZ"
  const cleaned = out
    .filter((s) => typeof s === "string" && s.trim())
    .map((s) => s.trim().toUpperCase());

  const deduped = Array.from(new Set(cleaned));

  // clamp, but do NOT force minCount if nothing is available
  if (deduped.length === 0) return [];
  const want = Math.min(Math.max(maxCount, 0), deduped.length);
  return deduped.slice(0, want);
}
