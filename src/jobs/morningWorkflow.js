// src/jobs/morningWorkflow.js
import { isTradingDayIST, toISTDateKey } from "../utils/holidays.js";
import { toIST } from "../utils/time.js";
import {
  getCoreUniverse,
  saveCoreUniverse,
  loadInstrumentDump,
  buildFNOBaseUniverseFromDump,
} from "../integrations/kite/universe.js";
import { refreshNewsOnce } from "../news/service.js";
import { runAutoPick } from "../services/AutoPickerService.js";
import { getDb } from "../db/mongo.js";
import { publishFinalList } from "../services/PublishService.js";
import { appendToStockSymbols } from "../services/StockSymbolsService.js";
const TOP_N = Number(process.env.AUTO_PUBLISH_TOP_N || 15);
const DEFAULT_SOURCE = "preopen";

export function istNow() {
  return toIST(new Date());
}

export async function ensureUniverse() {
  const dump = await loadInstrumentDump();
  const core = buildFNOBaseUniverseFromDump(dump);
  await saveCoreUniverse(core);
  return core.length;
}

export async function ingestNews() {
  return refreshNewsOnce({
    perSourceCap: Number(process.env.NEWS_PER_SOURCE_CAP || 80),
    maxArticles: Number(process.env.NEWS_MAX_ARTICLES || 500),
    mapConcurrency: Number(process.env.NEWS_MAP_CONCURRENCY || 8),
  });
}

export async function runPick() {
  return runAutoPick({ debug: false });
}

export async function publishFromLatest({ topN = TOP_N, source = DEFAULT_SOURCE } = {}) {
  const publish = await publishFinalList({
    minCount: Math.min(topN, 5),
    maxCount: topN,
    source,
    force: true,
  });

  if (!publish.ok || !Array.isArray(publish.symbols) || publish.symbols.length === 0) {
    return publish;
  }

  const app = await appendToStockSymbols(publish.symbols);
  return { ...publish, stock_symbols_append: app };
}

export async function guardPublishLatest({
  topN = TOP_N,
  source = DEFAULT_SOURCE,
} = {}) {
  const db = getDb();
  const key = `${toISTDateKey()}:${source}`;
  const doc = await db.collection("top_stock_symbols").findOne({ _id: key });
  if (doc) return { ok: true, skipped: true, _id: key };
  const res = await publishFromLatest({ topN, source });
  return { ...res, guard: true };
}

export async function runMorningWorkflow({
  topN = TOP_N,
  source = DEFAULT_SOURCE,
  log = console,
} = {}) {
  const day = toISTDateKey();
  if (!isTradingDayIST(new Date())) {
    const holidayOut = { ok: false, reason: "market_holiday", day };
    log?.warn?.("[morning]", holidayOut);
    return holidayOut;
  }

  const out = { ok: true, day, steps: {} };

  try {
    out.steps.universe = { count: await ensureUniverse(), at: istNow() };
    log?.info?.(`[morning] ${out.steps.universe.at} universe ready: ${out.steps.universe.count} names`);
  } catch (err) {
    out.ok = false;
    out.error = "ensure_universe_failed";
    out.details = err?.message || String(err);
    log?.error?.("[morning] ensureUniverse", err);
    return out;
  }

  try {
    out.steps.news = { ...(await ingestNews()), at: istNow() };
    log?.info?.(
      `[morning] ${out.steps.news.at} news ingested: rawUpserts=${out.steps.news.rawUpserts}, eventUpserts=${out.steps.news.eventUpserts}`
    );
  } catch (err) {
    out.ok = false;
    out.error = "ingest_news_failed";
    out.details = err?.message || String(err);
    log?.error?.("[morning] ingestNews", err);
    return out;
  }

  try {
    const pick = await runPick();
    out.steps.pick = {
      shortlisted: pick.shortlisted?.length || 0,
      filtered: pick.filteredSize,
      at: istNow(),
    };
    log?.info?.(
      `[morning] ${out.steps.pick.at} pick done: shortlisted=${out.steps.pick.shortlisted}, filtered=${out.steps.pick.filtered}`
    );
  } catch (err) {
    out.ok = false;
    out.error = "run_pick_failed";
    out.details = err?.message || String(err);
    log?.error?.("[morning] runPick", err);
    return out;
  }

  try {
    out.steps.publish = { ...(await publishFromLatest({ topN, source })), at: istNow() };
    log?.info?.(`[morning] ${out.steps.publish.at} publish result:`, out.steps.publish);
  } catch (err) {
    out.ok = false;
    out.error = "publish_failed";
    out.details = err?.message || String(err);
    log?.error?.("[morning] publish", err);
    return out;
  }

  try {
    out.steps.guard = { ...(await guardPublishLatest({ topN, source })), at: istNow() };
    if (!out.steps.guard.skipped) {
      log?.info?.(`[morning] ${out.steps.guard.at} guard publish:`, out.steps.guard);
    }
  } catch (err) {
    out.ok = false;
    out.error = "guard_failed";
    out.details = err?.message || String(err);
    log?.error?.("[morning] guard", err);
    return out;
  }

  return out;
}
