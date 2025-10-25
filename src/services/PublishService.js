// src/services/PublishService.js
import { getDb } from "../db/mongo.js";
import { toIST } from "../utils/time.js";
import { toISTDateKey } from "../utils/holidays.js";

/**
 * Persist final tradable symbols for the day in a single doc.
 * Schema:
 *  {
 *    _id: "YYYY-MM-DD",
 *    symbols: ["NSE:RELIANCE", "NSE:TCS", ...],
 *    source: "auto-pick",
 *    finalizedAtIST: "2025-10-24T08:20:02+05:30",
 *    meta: { topN, pickId }
 *  }
 */
export async function publishTopSymbols({ symbols, pickId, topN }) {
  if (!Array.isArray(symbols) || symbols.length === 0)
    return { ok: false, reason: "empty" };
  const db = getDb();
  const key = toISTDateKey();
  await db.collection("top_stock_symbols").updateOne(
    { _id: key },
    {
      $set: {
        _id: key,
        symbols,
        source: "auto-pick",
        finalizedAtIST: toIST(new Date()),
        meta: { topN, pickId },
      },
    },
    { upsert: true }
  );
  return { ok: true, key, count: symbols.length };
}

/**
 * Helper: derive symbols from latest pick document.
 * - Priority: use `top5` if present; else fall back to first N of `shortlisted`.
 */
export function symbolsFromPickDoc(pickDoc, topN = 30) {
  if (!pickDoc) return [];
  const prefer =
    Array.isArray(pickDoc.top5) && pickDoc.top5.length > 0
      ? pickDoc.top5
      : pickDoc.shortlisted || [];
  const syms = prefer
    .map((x) => x.symbol)
    .filter(Boolean)
    .slice(0, topN);
  return syms;
}
