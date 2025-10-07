// import KiteConnect from "kiteconnect";
import pkg from "kiteconnect";
// Build a liquid, bounded universe (~180 names) from F&O underlyings
import { getKite } from "./kiteClient.js";
// ESM/CJS compatible import
const KiteConnect = pkg?.KiteConnect ?? pkg?.default ?? pkg;

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });
if (process.env.KITE_ACCESS_TOKEN)
  kite.setAccessToken(process.env.KITE_ACCESS_TOKEN);

/** 1) Pull the full instruments master once per morning */
export async function loadInstrumentDump() {
  const all = await kite.getInstruments(); // large array
  return all;
}

/** 2) Derive F&O underlyings and map to NSE cash instruments */
export function buildFNOBaseUniverse(instruments) {
  // NSE cash equities (avoid indices/ETFs by filtering instrument_type === "EQ" when present)
  const nseCash = instruments.filter(
    (x) =>
      x.exchange === "NSE" &&
      (x.instrument_type === "EQ" || (x.segment ?? "").includes("NSE"))
  );

  // NFO equity derivatives
  const nfoEq = instruments.filter(
    (x) =>
      x.exchange === "NFO" &&
      (x.instrument_type === "FUT" || x.instrument_type === "OPTSTK")
  );

  // Underlying company "name" that appears on NFO rows
  const fnoNames = new Set(nfoEq.map((x) => x.name));

  // Match NSE cash rows with the same name → that’s our core universe
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

/** 3) Optional: filter by average daily traded value (keeps the very liquid core only) */
export async function filterByADV(base, { minADV = 5e7 } = {}) {
  // ₹5 crore ≈ 50,000,000
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
      if (!series?.length) continue;
      const last = series.slice(-20);
      const adv =
        last.reduce((s, c) => s + c.close * c.volume, 0) /
        Math.max(1, last.length);
      if (adv >= minADV) out.push(row);
    } catch {
      /* swallow & continue */
    }
  }
  return out;
}

// *************************************************
let cache = { date: null, items: [] };

export async function getCoreUniverse({ forceRefresh = false } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  if (!forceRefresh && cache.date === today && cache.items.length) {
    return cache.items;
  }

  const kite = getKite();

  // Pull per-exchange to avoid unnecessary rows and be explicit
  const [nse, nfo] = await Promise.all([
    kite.getInstruments("NSE"),
    kite.getInstruments("NFO"),
  ]);

  // 1) NSE cash equities only (EQ)
  const nseCash = nse.filter((x) => x.instrument_type === "EQ");

  // Build a map by cash tradingsymbol, e.g., "RELIANCE"
  const cashByTS = new Map(nseCash.map((x) => [x.tradingsymbol, x]));

  // 2) NFO stock derivatives (OPTSTK and FUT). Ignore index options/futures (OPTIDX/FUTIDX)
  const nfoStockDerivs = nfo.filter(
    (x) => x.instrument_type === "OPTSTK" || x.instrument_type === "FUT"
  );

  // 3) Derive base symbol from NFO tradingsymbol by stripping from the first digit onward
  //    Examples:
  //      "RELIANCE24OCTFUT"       -> "RELIANCE"
  //      "TCS24O241400CE"         -> "TCS"
  //      "LTIM24OCTFUT"           -> "LTIM"
  //    This reliably matches cash "tradingsymbol"
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

  // Cache & return
  cache = { date: today, items: core };
  return core;
}

function dedupeBySymbol(arr) {
  const s = new Set();
  return arr.filter((o) => (s.has(o.symbol) ? false : s.add(o.symbol)));
}
