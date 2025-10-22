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
import selectionConfig from "../config/selection.js";
import { getNewsScoresForSymbols } from "./NewsFactorService.js";
import { POLICY } from "../config/policy.js";

const HARD_GATES = {
  minAvg1mVol: 200000, // liquidity
  maxSpreadPct: 0.0035, // 0.35%
  maxATRPct: 0.05, // 5%
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

const overrideDeps = {};

function useDep(name) {
  return overrideDeps[name] ?? defaultDeps[name];
}

export async function runAutoPick({ debug = false } = {}) {
  const live = useDep("isMarketOpenIST")();
  const core = await useDep("getCoreUniverse")();

  // 1) try saved shortlist
  let symList = await useDep("getTodayShortlist")();
  let shortlistRows = [];
  let fallbackTried = false;
  const shortlistSource = symList.length ? "cached" : "generated";

  // 2) compute if missing
  if (!symList.length) {
    // first pass: strict (depth required when live)
    let short = await useDep("shortlistUniverse")(core, {
      minPrice: HARD_GATES.minPrice,
      maxSpreadPct: 0.006,
      preferPositiveGap: true,
      limit: live ? 80 : 120,
      requireDepth: live,
    });

    // fallback: if empty while live, retry without depth and slightly looser spread
    if (live && short.length === 0) {
      console.warn("[shortlist] strict returned 0; retrying without depth…");
      short = await useDep("shortlistUniverse")(core, {
        minPrice: HARD_GATES.minPrice,
        maxSpreadPct: 0.01, // 1%
        preferPositiveGap: true,
        limit: 120,
        requireDepth: false,
      });
      fallbackTried = true;
    }

    symList = short.map((s) => s.symbol);
    shortlistRows = short;
    if (symList.length) await useDep("buildAndSaveShortlist")(); // seed DB for later calls
  } else {
    const quickMap = new Map(core.map((x) => [x.symbol, x]));
    shortlistRows = symList.map((s) => quickMap.get(s)).filter(Boolean);
  }

  if (shortlistRows.length === 0) {
    const baseDoc = {
      ts: new Date(),
      pick: null,
      top5: [],
      universeSize: core.length,
      shortlisted: [],
      shortlistedCount: 0,
      filteredSize: 0,
      rules: buildRulesMeta(live, fallbackTried),
    };
    await savePick(baseDoc);
    return withDebug(baseDoc, debug, {
      shortlistSource,
      rejected: [],
      newsConsidered: 0,
    });
  }

  const shortlistMap = new Map(shortlistRows.map((row) => [row.symbol, row]));

  const newsMap = await useDep("getNewsScoresForSymbols")(symList, {
    windowMin: POLICY.NEWS_WINDOW_MIN,
  });

  const techRows = await scoreUniverse(shortlistRows, live ? 8 : 5);

  const qualified = [];
  const rejected = [];

  for (const tech of techRows) {
    const base = shortlistMap.get(tech.symbol) || {};
    const merged = { ...base, ...tech };
    const gatesOk = passGates(merged, live);
    const reasons = gatesOk ? [] : gateReasons(merged, live);

    const news = newsMap.get(tech.symbol) || null;
    const newsRaw = news?.score ?? 0;
    const newsScore = clamp01(newsRaw);
    const newsHits = news?.hits ?? 0;
    const newsAge = news?.ageMin ?? null;
    const newsQualified =
      newsHits >= POLICY.NEWS_GATES.minHits &&
      newsRaw >= POLICY.NEWS_GATES.minScore &&
      (newsAge == null || newsAge <= POLICY.NEWS_GATES.maxAgeMin);

    const techScore = clamp01(tech.scores?.techTotal ?? 0);
    const blendTotal =
      POLICY.WEIGHTS.tech * techScore +
      POLICY.WEIGHTS.news * (newsQualified ? newsScore : 0);

    const candidate = {
      symbol: tech.symbol,
      name: tech.name ?? base.name ?? null,
      total: blendTotal,
      techScore,
      newsScore,
      newsQualified,
      newsHits,
      newsAgeMin: newsAge,
      newsReasons: news?.reasons || [],
      last: pickNumber(merged.last),
      avg1mVol: pickNumber(merged.avg1mVol),
      atrPct: pickNumber(merged.atrPct),
      spreadPct: pickNumber(merged.spreadPct),
      gapPct: pickNumber(merged.gapPct ?? merged.gap),
      vwapDistPct: pickNumber(merged.vwapDistPct),
      ret5m: pickNumber(merged.ret5m),
      ret15m: pickNumber(merged.ret15m),
      ret60m: pickNumber(merged.ret60m),
      scores: tech.scores || {},
    };

    if (!gatesOk) {
      rejected.push({ ...candidate, gateReasons: reasons });
      continue;
    }

    qualified.push(candidate);
  }

  qualified.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.techScore !== a.techScore) return b.techScore - a.techScore;
    return (b.newsScore || 0) - (a.newsScore || 0);
  });

  const top5 = qualified.slice(0, PICK_LIMIT).map(buildPublicCandidate);
  const baseDoc = {
    ts: new Date(),
    pick: top5[0] || null,
    top5,
    universeSize: core.length,
    shortlisted: shortlistRows.map((r) => r.symbol),
    shortlistedCount: shortlistRows.length,
    filteredSize: qualified.length,
    rules: buildRulesMeta(live, fallbackTried),
  };

  if (!qualified.length) {
    baseDoc.pick = null;
  }

  await savePick(baseDoc);

  return withDebug(baseDoc, debug, {
    shortlistSource,
    rejected: rejected.map(buildRejectedCandidate),
    newsConsidered: newsMap.size,
  });
}

export async function getLatestPick() {
  const db = useDep("getDb")();
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
  const fetchTech = useDep("getTechScoresForSymbol");
  async function worker() {
    while (i < universe.length) {
      const idx = i++;
      const row = universe[idx];
      try {
        const res = await fetchTech(row);
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
  const db = useDep("getDb")();
  await db.collection("auto_picks").insertOne(doc); // auto-creates collection
  console.log("[pick] saved run @", doc.ts);
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

