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

/** Get OHLC snapshot */
export async function getOHLC(instruments) {
  const kite = getKite();
  return await kite.getOHLC(instruments);
}

/** Historical OHLCV for instrument token */
export async function getHistoricalData(token, fromISO, toISO, interval) {
  const kite = getKite();
  return await kite.getHistoricalData(token, fromISO, toISO, interval);
}

/* ---------- NEW: batch helpers (chunk + merge) ---------- */

function chunk(arr, n = 100) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export async function getOHLCBatch(symbols, chunkSize = 100) {
  const kite = getKite();
  const out = {};
  for (const part of chunk(symbols, chunkSize)) {
    try {
      const m = await kite.getOHLC(part);
      Object.assign(out, m);
    } catch {}
  }
  return out;
}

export async function getQuoteBatch(symbols, chunkSize = 100) {
  const kite = getKite();
  const out = {};
  for (const part of chunk(symbols, chunkSize)) {
    try {
      const m = await kite.getQuote(part);
      Object.assign(out, m);
    } catch {}
  }
  return out;
}
