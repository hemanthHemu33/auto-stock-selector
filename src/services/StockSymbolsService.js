// src/services/StockSymbolsService.js
import { getDb } from "../db/mongo.js";

/**
 * Append finalized NSE symbols into the single stock_symbols doc
 * - No new documents will be created (upsert: false)
 * - Old symbols are kept (we do a set-union via $addToSet)
 */
export async function appendToStockSymbols(symbols) {
  const db = getDb();
  if (!Array.isArray(symbols) || symbols.length === 0) {
    return { ok: false, reason: "empty_input" };
  }

  const norm = [...new Set(symbols.map(normalize).filter(Boolean))];
  if (!norm.length) return { ok: false, reason: "nothing_after_normalize" };

  const col = db.collection("stock_symbols");
  // IMPORTANT: do not create a new doc
  const doc = await col.findOne({});
  if (!doc) {
    console.warn(
      "[stock_symbols] No base document found. Skipping append (no upsert)."
    );
    return { ok: false, reason: "no_base_doc" };
  }

  const res = await col.updateOne(
    { _id: doc._id },
    { $addToSet: { symbols: { $each: norm } } },
    { upsert: false }
  );

  return {
    ok: true,
    matched: res.matchedCount,
    modified: res.modifiedCount,
    addedAttempted: norm.length,
  };
}

function normalize(s) {
  if (!s) return null;
  let t = String(s).trim().toUpperCase();
  // enforce NSE: prefix and only allow NSE symbols
  if (!t.includes(":")) t = `NSE:${t}`;
  if (!t.startsWith("NSE:")) return null;
  return t;
}
