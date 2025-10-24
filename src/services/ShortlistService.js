// src/services/ShortlistService.js
import { getDb } from "../db/mongo.js";
import { getCoreUniverse } from "../integrations/kite/universe.js";
import { shortlistUniverse } from "./FastFilterService.js";
import { toIST } from "../utils/time.js";
import { isMarketOpenIST } from "../utils/marketHours.js";

const COLL = "top_stock_symbols";

function istDateKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
}

/**
 * Build a shortlist from the (persisted) F&O core and save it for IST date.
 * Returns the saved doc.
 */
export async function buildAndSaveShortlist({
  minPrice = 20,
  maxSpreadPct = 0.006,
  preferPositiveGap = true,
  limitLive = 80,
  limitOff = 120,
} = {}) {
  const db = getDb();
  const istDate = istDateKey();
  const live = isMarketOpenIST();

  const core = await getCoreUniverse();
  const limit = live ? limitLive : limitOff;

  // const short = await shortlistUniverse(core, {
  //   minPrice,
  //   maxSpreadPct,
  //   preferPositiveGap,
  //   limit,
  //   requireDepth: live, // require depth only when live
  // });

  const short = await shortlistUniverse(universe, {
    minPrice: HARD_GATES.minPrice,
    maxSpreadPct: 0.006,
    preferPositiveGap: true,
    limit: isMarketOpenIST() ? 120 : 120,
    requireDepth: isMarketOpenIST(),
  });
  console.log(`[shortlist] took ${short.length}/${universe.length}`);

  const doc = {
    _id: istDate,
    dateIST: istDate,
    live,
    builtAtIST: toIST(new Date()),
    count: short.length,
    symbols: short.map((x) => x.symbol), // array of "NSE:HAL", etc.
    criteria: { minPrice, maxSpreadPct, preferPositiveGap, limit },
  };

  await db
    .collection(COLL)
    .updateOne({ _id: istDate }, { $set: doc }, { upsert: true });

  // (optional) ensure TTL index to auto-expire old days after N days
  // await db.collection(COLL).createIndex({ builtAtIST: 1 }, { expireAfterSeconds: 14 * 24 * 3600 });

  return doc;
}

/** Get today’s shortlist (if saved), else [] */
export async function getTodayShortlist() {
  const db = getDb();
  const row = await db.collection(COLL).findOne({ _id: istDateKey() });
  return row?.symbols || [];
}
