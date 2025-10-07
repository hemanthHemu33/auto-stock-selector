import { getKite } from "./kiteClient.js";

/** Get LTP for instruments, e.g., ["NSE:ADANIPOWER"] */
export async function getLTP(instruments) {
  const kite = getKite();
  return await kite.getLTP(instruments);
}

/** Get top-of-book quote (bid/ask/depth) */
export async function getQuote(instruments) {
  const kite = getKite();
  return await kite.getQuote(instruments);
}

/** Get OHLC snapshot (includes prev_close/open for gap calcs) */
export async function getOHLC(instruments) {
  const kite = getKite();
  return await kite.getOHLC(instruments);
}

/** Historical OHLCV for instrument token between ISO times at a given interval ("day" | "minute") */
export async function getHistoricalData(token, fromISO, toISO, interval) {
  const kite = getKite();
  return await kite.getHistoricalData(token, fromISO, toISO, interval);
}
