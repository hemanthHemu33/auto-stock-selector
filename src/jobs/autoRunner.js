// src/jobs/autoRunner.js
import cron from "node-cron";
import { isMarketOpenIST, isWeekdayIST } from "../utils/marketHours.js";
import {
  getCoreUniverse,
  loadInstrumentDump,
  buildFNOBaseUniverseFromDump,
  saveCoreUniverse,
} from "../integrations/kite/universe.js";
import { refreshNewsOnce } from "../news/service.js";
import {
  runAndFinalize,
  finalizeTopSymbols,
} from "../services/FinalizeService.js";
import { toIST } from "../utils/time.js";

// ENV toggles
const ENABLE_JOBS =
  (process.env.JOBS_ENABLED ?? "true").toLowerCase() !== "false";
const FINALIZE_LIMIT = Number(process.env.FINALIZE_LIMIT || 5);

// safe wrapper
async function safe(label, fn) {
  try {
    const t0 = Date.now();
    const out = await fn();
    const ms = Date.now() - t0;
    console.log(
      `[jobs] ${label} ok in ${ms}ms`,
      out ? JSON.stringify(out) : ""
    );
    return out;
  } catch (e) {
    console.error(`[jobs] ${label} failed:`, e?.message || e);
  }
}

// On boot: ensure core exists; do a first news pull (light)
export async function bootOnce() {
  if (!ENABLE_JOBS) return;
  await safe("boot.ensureCore", async () => {
    const core = await getCoreUniverse();
    if (!core?.length) {
      const dump = await loadInstrumentDump();
      const built = buildFNOBaseUniverseFromDump(dump);
      await saveCoreUniverse(built);
    }
  });
  // seed news once (off-hours ok)
  await safe("boot.news.seed", () =>
    refreshNewsOnce({ perSourceCap: 40, maxArticles: 200, mapConcurrency: 6 })
  );
}

// 08:00 IST — refresh F&O core every weekday
cron.schedule(
  "0 8 * * 1-5",
  () => {
    if (!ENABLE_JOBS) return;
    safe("08:00 refresh-core", async () => {
      const dump = await loadInstrumentDump();
      const built = buildFNOBaseUniverseFromDump(dump);
      await saveCoreUniverse(built);
      return { count: built.length, at: toIST(new Date()) };
    });
  },
  { timezone: "Asia/Kolkata" }
);

// Every 5 min 09:05–15:25 IST — refresh news (only if trading day)
cron.schedule(
  "*/5 9-15 * * 1-5",
  () => {
    if (!ENABLE_JOBS) return;
    if (!isWeekdayIST()) return;
    // Run regardless of exact minute within the hour window; service itself dedupes by upsert keys
    safe("news.refresh.5min", () =>
      refreshNewsOnce({ perSourceCap: 80, maxArticles: 500, mapConcurrency: 8 })
    );
  },
  { timezone: "Asia/Kolkata" }
);

// Every 10 min 09:20–15:25 IST — run picker + finalize (guard with market hours)
cron.schedule(
  "*/10 9-15 * * 1-5",
  () => {
    if (!ENABLE_JOBS) return;
    if (!isMarketOpenIST()) return;
    safe("picker.run+finalize.10min", () =>
      runAndFinalize({ limit: FINALIZE_LIMIT })
    );
  },
  { timezone: "Asia/Kolkata" }
);

// 15:30 IST — last pass: run + finalize, so scanner has a close-of-day set
cron.schedule(
  "30 15 * * 1-5",
  () => {
    if (!ENABLE_JOBS) return;
    // Market just closed, but we can still do a final run on the day’s data and store the names
    safe("picker.finalize.EOD", () =>
      runAndFinalize({ limit: FINALIZE_LIMIT })
    );
  },
  { timezone: "Asia/Kolkata" }
);

// Optional: a heartbeat so you can see the scheduler is alive in logs
cron.schedule(
  "0 * * * *",
  () => {
    if (!ENABLE_JOBS) return;
    console.log(`[jobs] heartbeat ${toIST(new Date())}`);
  },
  { timezone: "Asia/Kolkata" }
);

console.log(
  `[jobs] scheduler ${
    ENABLE_JOBS ? "enabled" : "disabled"
  } — FINALIZE_LIMIT=${FINALIZE_LIMIT}`
);
