// src/services/AutoPickerService.js
import { getCoreUniverse } from "../integrations/kite/universe.js";
import { getTechScoresForSymbol } from "./TechFactorService.js";

import { shortlistUniverse } from "./FastFilterService.js";
import { isMarketOpenIST } from "../utils/marketHours.js";
import { getDb } from "../db/mongo.js";
import {
  getTodayShortlist,
  buildAndSaveShortlist,
} from "./ShortlistService.js";

const HARD_GATES = {
  minAvg1mVol: 200000, // liquidity
  maxSpreadPct: 0.0035, // 0.35%
  maxATRPct: 0.05, // 5%
  minPrice: 20,
};

export async function runAutoPick({ debug = false } = {}) {
  // inside runAutoPick
  const live = isMarketOpenIST();
  const core = await getCoreUniverse();

  // 1) try saved shortlist
  let symList = await getTodayShortlist();

  // 2) compute if missing
  let shortlistRows = [];
  if (!symList.length) {
    // first pass: strict (depth required when live)
    let short = await shortlistUniverse(core, {
      minPrice: HARD_GATES.minPrice,
      maxSpreadPct: 0.006,
      preferPositiveGap: true,
      limit: live ? 80 : 120,
      requireDepth: live,
    });

    // fallback: if empty while live, retry without depth and slightly looser spread
    if (live && short.length === 0) {
      console.warn("[shortlist] strict returned 0; retrying without depth…");
      short = await shortlistUniverse(core, {
        minPrice: HARD_GATES.minPrice,
        maxSpreadPct: 0.01, // 1%
        preferPositiveGap: true,
        limit: 120,
        requireDepth: false,
      });
    }

    symList = short.map((s) => s.symbol);
    shortlistRows = short;
    if (symList.length) await buildAndSaveShortlist(); // seed DB for later calls
  } else {
    const quickMap = new Map(core.map((x) => [x.symbol, x]));
    shortlistRows = symList.map((s) => quickMap.get(s)).filter(Boolean);
  }

  if (shortlistRows.length === 0) {
    // still nothing → return early with an informative payload
    const doc = {
      ts: new Date(),
      pick: null,
      top5: [],
      universeSize: core.length,
      shortlisted: [],
      filteredSize: 0,
      rules: { HARD_GATES, live, fallbackTried: live },
    };
    await savePick(doc);
    return doc;
  }

  // …then proceed to scoreUniverse(shortlistRows, …) and the rest of your logic6;
}
function normalizeNews(x) {
  // compress to [-1, 1] using tanh-like squashing
  return Math.max(-1, Math.min(1, x / 2));
}
export async function getLatestPick() {
  const db = getDb();
  const row = await db
    .collection("auto_picks")
    .find()
    .sort({ ts: -1 })
    .limit(1)
    .toArray();
  return row[0] || null;
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
  const db = getDb();
  await db.collection("auto_picks").insertOne(doc); // auto-creates collection
  console.log("[pick] saved run @", doc.ts);
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
