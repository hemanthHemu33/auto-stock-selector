import { getDb } from "../db/mongo.js";
import { toIST } from "../utils/time.js";
import { getLatestPick, runAutoPick } from "./AutoPickerService.js";

/** YYYY-MM-DD in IST (trading-day key) */
function istDateKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/**
 * Persist today's finalized symbols:
 * - symbols: array of "NSE:SYMBOL" strings (deduped, non-empty)
 * - source: free-form tag, defaults to "auto-pick"
 */
export async function saveFinalSymbols({ symbols, source = "auto-pick" }) {
  const db = getDb();
  const key = istDateKey();

  // basic sanitation & dedupe
  const out = Array.from(
    new Set(
      (symbols || [])
        .filter((s) => typeof s === "string" && s.startsWith("NSE:"))
        .map((s) => s.trim())
    )
  );

  if (!out.length) {
    throw new Error("no valid NSE symbols to finalize");
  }

  const doc = {
    _id: key,
    symbols: out,
    source,
    createdAtIST: toIST(new Date()),
  };

  await db
    .collection("top_stock_symbols")
    .updateOne({ _id: key }, { $set: doc }, { upsert: true });

  return doc;
}

/** Read today's finalized symbols (may be null if not saved yet) */
export async function getFinalSymbolsToday() {
  const db = getDb();
  const key = istDateKey();
  return db.collection("top_stock_symbols").findOne({ _id: key });
}

// src/services/FinalizeService.js

/**
 * Finalize top N symbols into `top_stock_symbols`
 * Only writes when we have at least 1 symbol.
 */
export async function finalizeTopSymbols({ limit = 5 } = {}) {
  const db = getDb();
  const latest = await getLatestPick();
  if (!latest || !Array.isArray(latest.top5)) {
    return { ok: false, reason: "no_latest_pick" };
  }
  const chosen = latest.top5
    .slice(0, Math.max(1, Number(limit) || 5))
    .map((x) => x.symbol)
    .filter((s) => typeof s === "string" && s.startsWith("NSE:"));

  if (!chosen.length) {
    return { ok: false, reason: "empty_top5" };
  }

  const _id = istDateKey();
  await db.collection("top_stock_symbols").updateOne(
    { _id },
    {
      $set: {
        _id,
        symbols: chosen,
        source: "auto-pick",
        createdAtIST: toIST(new Date()),
      },
    },
    { upsert: true }
  );

  return { ok: true, date: _id, count: chosen.length, symbols: chosen };
}

/**
 * Convenience: do a run now and then finalize.
 * Useful at close or on-demand retries (called by the scheduler).
 */
export async function runAndFinalize({ limit = 5 } = {}) {
  await runAutoPick({ debug: false });
  return finalizeTopSymbols({ limit });
}
