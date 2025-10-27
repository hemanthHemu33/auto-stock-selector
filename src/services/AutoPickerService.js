// src/services/AutoPickerService.js
import { getCoreUniverse } from "../integrations/kite/universe.js";
import { getTechScoresForSymbol } from "./TechFactorService.js";
import { shortlistUniverse } from "./FastFilterService.js";
import { getDb } from "../db/mongo.js";
import {
  getTodayShortlist,
  buildAndSaveShortlist,
} from "./ShortlistService.js";
import selectionConfig from "../config/selection.js";
import { getNewsScoresForSymbols } from "./NewsFactorService.js";
import { POLICY } from "../config/policy.js";
import { isMarketOpenIST, minutesSinceOpenIST } from "../utils/marketHours.js";
// const HARD_GATES = {
//   minAvg1mVol: 200000, // liquidity
//   maxSpreadPct: 0.0035, // 0.35%
//   maxATRPct: 0.05, // 5%
//   minPrice: 20,
// };
const HARD_GATES = {
  minAvg1mVol: 50000, // was 200000
  maxSpreadPct: 0.006, // was 0.0035
  maxATRPct: 0.07, // was 0.05
  minPrice: 20,
};

const PICK_LIMIT = 5;

const defaultDeps = {
  getCoreUniverse,
  getTechScoresForSymbol,
  shortlistUniverse,
  isMarketOpenIST,
  getDb,
  getTodayShortlist,
  buildAndSaveShortlist,
  getNewsScoresForSymbols,
};

// time-adaptive gates (looser just after open)
function currentGates(live) {
  if (!live) {
    return { ...BASE_GATES, minAvg1mVol: 0, maxSpreadPct: 0.01 };
  }
  const m = minutesSinceOpenIST();
  if (m < 15) return { ...BASE_GATES, minAvg1mVol: 50000, maxSpreadPct: 0.008 };
  if (m < 45)
    return { ...BASE_GATES, minAvg1mVol: 120000, maxSpreadPct: 0.005 };
  return { ...BASE_GATES };
}
const overrideDeps = {};

function useDep(name) {
  return overrideDeps[name] ?? defaultDeps[name];
}

export async function runAutoPick({ debug = false } = {}) {
  const core = await getCoreUniverse(); // ~208 names
  const live = isMarketOpenIST();
  const gates = currentGates(live);

  // Stage-1 shortlist (cheap)
  const short = await shortlistUniverse(core, {
    minPrice: gates.minPrice,
    maxSpreadPct: Math.max(gates.maxSpreadPct, 0.006), // a bit looser at shortlist stage
    preferPositiveGap: true,
    limit: 120,
    requireDepth: live,
  });

  // Heavy scoring (quotes + ATR)
  const results = await scoreUniverse(short, 5);

  const passed = [];
  const failed = [];
  for (const r of results) {
    if (!r) continue;
    if (passGates(r, gates, live)) passed.push(r);
    else
      failed.push({
        symbol: r.symbol,
        name: r.name,
        reasons: gateReasons(r, gates, live),
      });
  }

  const ranked = passed.sort(
    (a, b) => (b.scores?.techTotal || 0) - (a.scores?.techTotal || 0)
  );
  const top5 = ranked.slice(0, 5);
  const pick = ranked[0] || null;

  const doc = {
    ts: new Date(),
    pick,
    top5,
    universeSize: core.length,
    shortlisted: short.map((x) => ({ symbol: x.symbol, name: x.name })),
    filteredSize: passed.length,
    rules: { HARD_GATES: BASE_GATES, live },
  };
  await savePick(doc);

  if (debug) {
    doc.considered = results.filter(Boolean).map((r) => ({
      symbol: r.symbol,
      name: r.name,
      last: r.last,
      avg1mVol: r.avg1mVol,
      spreadPct: r.spreadPct,
      atrPct: r.atrPct,
      techTotal: r.scores?.techTotal ?? null,
    }));
    doc.filteredOut = failed; // ← see exactly why names failed
  } else {
    doc.considered = short.map((s) => ({ symbol: s.symbol, name: s.name }));
  }

  return doc;
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

/* ---------------- helpers ---------------- */

// function passGates(r, G, live) {
//   const priceOk = (r.last || 0) >= G.minPrice;
//   const volOk = (r.avg1mVol || 0) >= G.minAvg1mVol;
//   const atrOk = r.atrPct == null ? true : r.atrPct <= G.maxATRPct; // allow if ATR missing
//   const spreadOk = live ? (r.spreadPct ?? 0) <= G.maxSpreadPct : true;
//   return priceOk && volOk && atrOk && spreadOk;
// }

function passGates(r, live = true) {
  const last = r.last || 0;
  const vol = r.avg1mVol || 0;
  const turnover1m = r.avg1mTurnover ?? last * vol; // ₹/min approx

  const priceOk = last >= HARD_GATES.minPrice;
  const liqOk = turnover1m >= 2e7; // ₹2 crore/min (tune)
  const atrOk = (r.atrPct || 0) <= HARD_GATES.maxATRPct;
  const spreadOk = live ? (r.spreadPct || 1) <= HARD_GATES.maxSpreadPct : true;

  return priceOk && liqOk && atrOk && spreadOk;
}

function gateReasons(r, G, live) {
  const reasons = [];
  if ((r.last || 0) < G.minPrice) reasons.push(`price<₹${G.minPrice}`);
  if ((r.avg1mVol || 0) < G.minAvg1mVol)
    reasons.push(`avg1mVol<${G.minAvg1mVol}`);
  if (r.atrPct != null && r.atrPct > G.maxATRPct)
    reasons.push(`atr%>${(G.maxATRPct * 100).toFixed(1)}%`);
  if (live && (r.spreadPct ?? 1) > G.maxSpreadPct)
    reasons.push(`spread>${(G.maxSpreadPct * 100).toFixed(2)}%`);
  return reasons;
}

async function scoreUniverse(list, concurrency = 5) {
  const out = [];
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const idx = i++;
      const row = list[idx];
      try {
        const res = await getTechScoresForSymbol(row);
        if (res) out.push(res);
      } catch {
        // ignore per-symbol errors
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}
async function savePick(doc) {
  const db = getDb();
  await db.collection("auto_picks").insertOne(doc); // creates the collection if missing
  console.log("[auto-pick] saved run @", doc.ts.toISOString());
}
function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function pickNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function round4(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  return Math.round(x * 10000) / 10000;
}

function buildPublicCandidate(row) {
  return {
    symbol: row.symbol,
    name: row.name,
    score: round4(row.total),
    components: {
      tech: round4(row.techScore),
      news: row.newsQualified ? round4(row.newsScore) : 0,
    },
    news: {
      hits: row.newsHits,
      qualified: row.newsQualified,
      rawScore: round4(row.newsScore),
      ageMin: row.newsAgeMin ?? null,
      reasons: row.newsReasons,
    },
    metrics: {
      last: row.last,
      avg1mVol: row.avg1mVol,
      atrPct: row.atrPct,
      spreadPct: row.spreadPct,
      gapPct: row.gapPct,
      vwapDistPct: row.vwapDistPct,
      ret5m: row.ret5m,
      ret15m: row.ret15m,
      ret60m: row.ret60m,
    },
    scores: row.scores,
  };
}

function buildRejectedCandidate(row) {
  return {
    ...buildPublicCandidate(row),
    gateReasons: row.gateReasons || [],
  };
}

function buildRulesMeta(live, fallbackTried) {
  return {
    HARD_GATES,
    hard: HARD_GATES,
    news: POLICY.NEWS_GATES,
    weights: selectionConfig.weights || POLICY.WEIGHTS,
    blend: POLICY.WEIGHTS,
    live,
    fallbackTried,
  };
}

function withDebug(baseDoc, debug, debugPayload) {
  if (!debug) return baseDoc;
  return { ...baseDoc, debug: debugPayload };
}

export function __setAutoPickerTestOverrides(map = {}) {
  Object.assign(overrideDeps, map);
}

export function __resetAutoPickerTestOverrides() {
  for (const key of Object.keys(overrideDeps)) delete overrideDeps[key];
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
