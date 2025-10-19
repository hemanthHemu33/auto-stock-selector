// src/integrations/kite/universe.js

// Build a liquid, bounded universe (~170–210 names) from F&O underlyings.
// Persists one snapshot per IST trading day in Mongo.

import { getDb } from "../../db/mongo.js";
import { toIST } from "../../utils/time.js";
import { getKite } from "./kiteClient.js";

/** Mongo collection name for the daily core snapshot */
const CORE_COLL = "universe_core";

/** Return YYYY-MM-DD for IST “trading day” key */
function istDateKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** Small in-memory cache keyed by IST date */
let coreCache = { date: null, items: null };

/* ------------------------------------------------------------------------------------------------
 * 1) LOW-LEVEL FETCHERS
 * ------------------------------------------------------------------------------------------------ */

/**
 * Pull per-exchange instruments (NSE cash & NFO derivatives).
 * This is lighter/clearer than fetching the giant combined dump.
 */
export async function loadInstrumentDump() {
  const kite = getKite();
  const [nse, nfo] = await Promise.all([
    kite.getInstruments("NSE"),
    kite.getInstruments("NFO"),
  ]);
  return { nse, nfo };
}

/* ------------------------------------------------------------------------------------------------
 * 2) BUILDERS
 * ------------------------------------------------------------------------------------------------ */

/**
 * Build core F&O universe from per-exchange dumps:
 *  - NSE cash: instrument_type === "EQ"
 *  - NFO: stock derivatives only (OPTSTK / FUT), ignore index (OPTIDX/FUTIDX)
 *  - Derive base “cash” symbol by stripping from the first digit in the NFO tradingsymbol
 *    Examples:
 *      RELIANCE24OCTFUT      -> RELIANCE
 *      TCS24O241400CE        -> TCS
 *      LTIM24OCTFUT          -> LTIM
 */
export function buildFNOBaseUniverseFromDump({ nse, nfo }) {
  // 1) NSE cash equities only
  const nseCash = nse.filter((x) => x.instrument_type === "EQ");
  const cashByTS = new Map(nseCash.map((x) => [x.tradingsymbol, x]));

  // 2) NFO stock derivatives (ignore index derivatives)
  const nfoStockDerivs = nfo.filter(
    (x) => x.instrument_type === "OPTSTK" || x.instrument_type === "FUT"
  );

  // 3) Get base symbol by trimming digits-onward from NFO tradingsymbol
  const baseSet = new Set();
  for (const d of nfoStockDerivs) {
    const base = d.tradingsymbol.replace(/[0-9].*$/, "");
    if (cashByTS.has(base)) baseSet.add(base);
  }

  // 4) Map back to NSE cash rows
  const core = [...baseSet].map((ts) => {
    const x = cashByTS.get(ts);
    return {
      symbol: `NSE:${x.tradingsymbol}`,
      token: x.instrument_token,
      name: x.name,
      tick_size: x.tick_size,
    };
  });

  return dedupeBySymbol(core);
}

/**
 * Compatibility builder: if someone passes the *combined* `getInstruments()` array
 * (no exchange arg) we can still build the F&O core from it.
 */
export function buildFNOBaseUniverse(all) {
  const nseCash = all.filter(
    (x) =>
      x.exchange === "NSE" &&
      (x.instrument_type === "EQ" || (x.segment ?? "").includes("NSE"))
  );

  const nfoEq = all.filter(
    (x) =>
      x.exchange === "NFO" &&
      (x.instrument_type === "FUT" || x.instrument_type === "OPTSTK")
  );

  const fnoNames = new Set(nfoEq.map((x) => x.name));

  const base = nseCash
    .filter((x) => fnoNames.has(x.name))
    .map((x) => ({
      symbol: `NSE:${x.tradingsymbol}`,
      token: x.instrument_token,
      name: x.name,
      tick_size: x.tick_size,
    }));

  return dedupeBySymbol(base);
}

/* ------------------------------------------------------------------------------------------------
 * 3) DB PERSISTENCE (one snapshot per IST day)
 * ------------------------------------------------------------------------------------------------ */

export async function saveCoreUniverse(items) {
  const db = getDb();
  const key = istDateKey();
  await db.collection(CORE_COLL).updateOne(
    { _id: key },
    {
      $set: {
        _id: key,
        items,
        count: items.length,
        builtAtIST: toIST(new Date()),
      },
    },
    { upsert: true }
  );
  // also refresh in-memory cache
  coreCache = { date: key, items };
}

export async function loadCoreUniverse() {
  const db = getDb();
  const key = istDateKey();
  const row = await db.collection(CORE_COLL).findOne({ _id: key });
  return row?.items || [];
}

/**
 * Preferred accessor used by the rest of the app:
 * 1) Return in-memory cache if for today (IST).
 * 2) Else try today’s snapshot from DB.
 * 3) Else fetch dumps → build → save → return.
 */
export async function getCoreUniverse({ forceRefresh = false } = {}) {
  const key = istDateKey();

  if (
    !forceRefresh &&
    coreCache.date === key &&
    Array.isArray(coreCache.items) &&
    coreCache.items.length
  ) {
    return coreCache.items;
  }

  // Try DB first
  const fromDb = await loadCoreUniverse();
  if (fromDb.length && !forceRefresh) {
    coreCache = { date: key, items: fromDb };
    return fromDb;
  }

  // Rebuild from Kite and persist
  const dump = await loadInstrumentDump(); // { nse, nfo }
  const core = buildFNOBaseUniverseFromDump(dump);

  await saveCoreUniverse(core);
  return core;
}

/* ------------------------------------------------------------------------------------------------
 * 4) Optional: ADV filter
 * ------------------------------------------------------------------------------------------------ */

/**
 * Filter by average daily traded value (30 days → last 20 bars averaged)
 * minADV default = ₹5 crore (50,000,000)
 */
export async function filterByADV(base, { minADV = 5e7 } = {}) {
  const kite = getKite();
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 30);

  const out = [];
  for (const row of base) {
    try {
      const series = await kite.getHistoricalData(
        row.token,
        from.toISOString(),
        to.toISOString(),
        "day"
      );
      if (!Array.isArray(series) || !series.length) continue;
      const last = series.slice(-20);
      const adv =
        last.reduce(
          (s, c) => s + (Number(c.close) || 0) * (Number(c.volume) || 0),
          0
        ) / Math.max(1, last.length);
      if (adv >= minADV) out.push(row);
    } catch {
      /* ignore per-symbol errors */
    }
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * 5) Utils
 * ------------------------------------------------------------------------------------------------ */

function dedupeBySymbol(arr) {
  const s = new Set();
  return arr.filter((o) => (s.has(o.symbol) ? false : s.add(o.symbol)));
}
