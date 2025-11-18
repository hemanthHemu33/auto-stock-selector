// src/jobs/scheduler.js
import cron from "node-cron";
import { isTradingDayIST, toISTDateKey } from "../utils/holidays.js";
import { getDb } from "../db/mongo.js";
import { acquireLock } from "../db/locks.js";
import { toIST } from "../utils/time.js";
import {
  ensureUniverse,
  ingestNews,
  runPick,
  publishFromLatest,
  guardPublishLatest,
} from "./morningWorkflow.js";
const tz = "Asia/Kolkata";

// Small safety: only run on 1 instance
async function shouldRunToday(keySuffix) {
  const key = `${keySuffix}:${toISTDateKey()}`;
  return acquireLock(key, 90 * 60); // 90 min lock window
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
    const res = await guardPublishLatest();
    if (!res?.skipped) {
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
