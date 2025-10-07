import { getCoreUniverse } from "../integrations/kite/universe.js";
import { getTechScoresForSymbol } from "./TechFactorService.js";
import { MongoClient } from "mongodb";
import { shortlistUniverse } from "./FastFilterService.js";
import { isMarketOpenIST } from "../utils/marketHours.js";

const HARD_GATES = {
  minAvg1mVol: 200000, // liquidity
  maxSpreadPct: 0.0035, // 0.35%
  maxATRPct: 0.05, // 5%
  minPrice: 20,
};

export async function runAutoPick({ debug = false } = {}) {
  const universe = await getCoreUniverse();

  const live = isMarketOpenIST(); // true during 09:15–15:30 IST

  // Stage-1: require depth only when live
  const short = await shortlistUniverse(universe, {
    minPrice: HARD_GATES.minPrice,
    maxSpreadPct: 0.006,
    preferPositiveGap: true,
    limit: live ? 80 : 120, // off-hours keep a slightly larger shortlist
    requireDepth: live,
  });

  const results = await scoreUniverse(short, 5);

  const passed = [];
  const failed = [];
  for (const r of results) {
    if (!r) continue;
    if (passGates(r, live)) passed.push(r);
    else
      failed.push({
        symbol: r.symbol,
        name: r.name,
        reasons: gateReasons(r, live),
      });
  }

  const ranked = passed.sort((a, b) => b.scores.techTotal - a.scores.techTotal);
  const top5 = ranked.slice(0, 5);
  const pick = ranked[0] || null;

  const doc = {
    ts: new Date(),
    pick,
    top5,
    universeSize: universe.length,
    shortlisted: short.map((x) => ({ symbol: x.symbol, name: x.name })),
    filteredSize: passed.length,
    rules: { HARD_GATES, live },
  };

  await savePick(doc);

  if (debug) {
    doc.considered = results.filter(Boolean).map((r) => ({
      symbol: r.symbol,
      name: r.name,
      techTotal: r.scores.techTotal,
    }));
    doc.filteredOut = failed;
  } else {
    doc.considered = short.map((s) => ({ symbol: s.symbol, name: s.name }));
  }

  return doc;
}

export async function getLatestPick() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.DB_NAME || "scanner_app";
  const client = new MongoClient(uri, { ignoreUndefined: true });
  try {
    await client.connect();
    const db = client.db(dbName);
    const row = await db
      .collection("auto_picks")
      .find()
      .sort({ ts: -1 })
      .limit(1)
      .toArray();
    return row[0] || null;
  } finally {
    try {
      await client.close();
    } catch {}
  }
}

// ---- helpers ----
function passGates(r, live = true) {
  const priceOk = (r.last || 0) >= HARD_GATES.minPrice;
  const volOk = (r.avg1mVol || 0) >= HARD_GATES.minAvg1mVol;
  const atrOk = (r.atrPct || 0) <= HARD_GATES.maxATRPct;
  const spreadOk = live ? (r.spreadPct || 1) <= HARD_GATES.maxSpreadPct : true;
  return priceOk && volOk && atrOk && spreadOk;
}

function gateReasons(r, live = true) {
  const reasons = [];
  if ((r.last || 0) < HARD_GATES.minPrice)
    reasons.push(`price<₹${HARD_GATES.minPrice}`);
  if ((r.avg1mVol || 0) < HARD_GATES.minAvg1mVol)
    reasons.push(`avg1mVol<${HARD_GATES.minAvg1mVol}`);
  if ((r.atrPct || 0) > HARD_GATES.maxATRPct)
    reasons.push(`atr%>${(HARD_GATES.maxATRPct * 100).toFixed(1)}%`);
  if (live && (r.spreadPct || 1) > HARD_GATES.maxSpreadPct)
    reasons.push(`spread>${(HARD_GATES.maxSpreadPct * 100).toFixed(2)}%`);
  return reasons;
}

async function scoreUniverse(universe, concurrency = 5) {
  const out = [];
  let i = 0;
  async function worker() {
    while (i < universe.length) {
      const idx = i++;
      const row = universe[idx];
      try {
        const res = await getTechScoresForSymbol(row);
        out.push(res);
      } catch (_) {
        /* ignore per-symbol errors */
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}

async function savePick(doc) {
  const uri = process.env.MONGO_URI;
  if (!uri) return;
  const dbName = process.env.DB_NAME || "scanner_app";
  const client = new MongoClient(uri, { ignoreUndefined: true });
  try {
    await client.connect();
    const db = client.db(dbName);
    await db.collection("auto_picks").insertOne(doc);
  } finally {
    try {
      await client.close();
    } catch {}
  }
}

/** Wrapper class so existing imports keep working */
export class AutoPickerService {
  static async run(opts) {
    return runAutoPick(opts);
  }
  static async getLatest() {
    return getLatestPick();
  }
}
