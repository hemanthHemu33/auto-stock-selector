// src/jobs/scheduler.js
import cron from "node-cron";
import { isTradingDayIST, toISTDateKey } from "../utils/holidays.js";
import {
  getCoreUniverse,
  saveCoreUniverse,
  loadInstrumentDump,
  buildFNOBaseUniverseFromDump,
} from "../integrations/kite/universe.js";
import { refreshNewsOnce } from "../news/service.js";
import { runAutoPick } from "../services/AutoPickerService.js";
import { getDb } from "../db/mongo.js";
import {
  publishTopSymbols,
  symbolsFromPickDoc,
} from "../services/PublishService.js";
import { acquireLock } from "../db/locks.js";
import { toIST } from "../utils/time.js";
import { appendToStockSymbols } from "../services/StockSymbolsService.js";
const tz = "Asia/Kolkata";
const TOP_N = Number(process.env.AUTO_PUBLISH_TOP_N || 30);

// Small safety: only run on 1 instance
async function shouldRunToday(keySuffix) {
  const key = `${keySuffix}:${toISTDateKey()}`;
  return acquireLock(key, 90 * 60); // 90 min lock window
}

async function ensureUniverse() {
  // Force rebuild and persist for today (idempotent)
  const dump = await loadInstrumentDump();
  const core = buildFNOBaseUniverseFromDump(dump);
  await saveCoreUniverse(core);
  return core.length;
}

async function ingestNews() {
  // Pre-market ingest window: last ~120 minutes
  return refreshNewsOnce({
    perSourceCap: Number(process.env.NEWS_PER_SOURCE_CAP || 80),
    maxArticles: Number(process.env.NEWS_MAX_ARTICLES || 500),
    mapConcurrency: Number(process.env.NEWS_MAP_CONCURRENCY || 8),
  });
}

async function runPick() {
  return runAutoPick({ debug: false });
}

async function publishFromLatest(topN = TOP_N) {
  const db = getDb();
  const latest = await db
    .collection("auto_picks")
    .find()
    .sort({ ts: -1 })
    .limit(1)
    .toArray();

  const pickDoc = latest[0];
  const symbols = symbolsFromPickDoc(pickDoc, topN);

  // If empty, fall back to shortlist
  if (!symbols.length && Array.isArray(pickDoc?.shortlisted)) {
    const fallback = pickDoc.shortlisted.slice(0, topN).map((x) => x.symbol);
    if (fallback.length) {
      const pub = await publishTopSymbols({
        symbols: fallback,
        pickId: pickDoc?._id,
        topN,
      });
      // ALSO append to stock_symbols (union)
      const app = await appendToStockSymbols(fallback);
      return { ...pub, stock_symbols_append: app };
    }
  }

  if (!symbols.length) return { ok: false, reason: "no_symbols" };

  const pub = await publishTopSymbols({ symbols, pickId: pickDoc?._id, topN });
  // ALSO append to stock_symbols (union)
  const app = await appendToStockSymbols(symbols);
  return { ...pub, stock_symbols_append: app };
}

async function clearNewsCollections() {
  const db = getDb();
  const rawResult = await db.collection("news_raw").deleteMany({});
  const eventsResult = await db.collection("news_events").deleteMany({});
  return {
    rawDeleted: rawResult?.deletedCount ?? 0,
    eventsDeleted: eventsResult?.deletedCount ?? 0,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// CRON PLAN (IST):
// 07:50  Ensure F&O universe for today (DB snapshot)
// 08:00  Ingest headlines (last ~120m) → events
// 08:10  Run auto-pick (heavy scoring)
// 08:20  Publish symbols → top_stock_symbols (scanner reads this)
// 08:28  Guard: if not published, try once more
// Skips weekends and listed NSE holidays
// ───────────────────────────────────────────────────────────────────────────────

function tradingGuard(fn) {
  return async () => {
    if (!isTradingDayIST(new Date())) return;
    try {
      await fn();
    } catch (e) {
      console.error("[cron]", e?.message || e);
    }
  };
}

cron.schedule(
  "50 7 * * 1-5",
  tradingGuard(async () => {
    if (!(await shouldRunToday("universe"))) return;
    const n = await ensureUniverse();
    console.log(`[cron] ${toIST(new Date())} universe ready: ${n} names`);
  }),
  { timezone: tz }
);

cron.schedule(
  "0 8 * * 1-5",
  tradingGuard(async () => {
    if (!(await shouldRunToday("news"))) return;
    const out = await ingestNews();
    console.log(
      `[cron] ${toIST(new Date())} news ingested: rawUpserts=${
        out.rawUpserts
      }, eventUpserts=${out.eventUpserts}`
    );
  }),
  { timezone: tz }
);

cron.schedule(
  "10 8 * * 1-5",
  tradingGuard(async () => {
    if (!(await shouldRunToday("pick"))) return;
    const r = await runPick();
    console.log(
      `[cron] ${toIST(new Date())} pick done: shortlisted=${
        r.shortlisted?.length || 0
      }, filtered=${r.filteredSize}`
    );
  }),
  { timezone: tz }
);

cron.schedule(
  "20 8 * * 1-5",
  tradingGuard(async () => {
    if (!(await shouldRunToday("publish"))) return;
    const res = await publishFromLatest();
    console.log(`[cron] ${toIST(new Date())} publish result:`, res);
  }),
  { timezone: tz }
);

cron.schedule(
  "28 8 * * 1-5",
  tradingGuard(async () => {
    // guard: if no doc for today, publish now
    const db = getDb();
    const key = toISTDateKey();
    const doc = await db.collection("top_stock_symbols").findOne({ _id: key });
    if (!doc) {
      const res = await publishFromLatest();
      console.log(`[cron] ${toIST(new Date())} guard publish:`, res);
    }
  }),
  { timezone: tz }
);

cron.schedule(
  "59 23 */3 * *",
  async () => {
    try {
      if (!(await shouldRunToday("news_cleanup"))) return;
      const res = await clearNewsCollections();
      console.log(
        `[cron] ${toIST(new Date())} news cleanup: rawDeleted=${res.rawDeleted}, eventsDeleted=${res.eventsDeleted}`
      );
    } catch (e) {
      console.error("[cron] news cleanup", e?.message || e);
    }
  },
  { timezone: tz }
);

// Export nothing; importing this file starts the schedules.
