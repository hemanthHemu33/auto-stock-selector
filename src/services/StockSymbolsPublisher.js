// src/services/StockSymbolsPublisher.js
import { getDb } from "../db/mongo.js";

/**
 * Merge today's picked symbols into the scanner's stock_symbols collection.
 *
 * - Do NOT remove old ones.
 * - Do NOT create multiple docs. Use a single global doc.
 * - Avoid duplicates.
 * - If the collection is empty (fresh DB), create the first doc.
 */
export async function publishSymbolsToScanner(symbols = []) {
  if (!Array.isArray(symbols) || symbols.length === 0) {
    console.log(
      "[publisher] No symbols to publish into stock_symbols, skipping."
    );
    return { ok: false, reason: "no_symbols" };
  }

  const db = await getDb();
  const col = db.collection("stock_symbols");

  // We just upsert one shared doc.
  const res = await col.updateOne(
    {}, // match "the" doc (first / only doc in this collection)
    {
      $addToSet: {
        symbols: { $each: symbols },
      },
      $currentDate: {
        updatedAt: true,
      },
    },
    {
      upsert: true,
    }
  );

  console.log(
    `[publisher] Published ${symbols.length} symbols to stock_symbols (matched ${res.matchedCount}, modified ${res.modifiedCount})`
  );

  return { ok: true, publishedCount: symbols.length };
}
