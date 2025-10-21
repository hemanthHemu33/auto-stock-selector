import { getDb } from "../db/mongo.js";
import { toIST } from "../utils/time.js";

/** YYYY-MM-DD in IST (trading-day key) */
function istDateKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/**
 * Persist today's finalized symbols:
 * - symbols: array of "NSE:SYMBOL" strings (deduped, non-empty)
 * - source: free-form tag, defaults to "auto-pick"
 */
export async function saveFinalSymbols({ symbols, source = "auto-pick" }) {
  const db = getDb();
  const key = istDateKey();

  // basic sanitation & dedupe
  const out = Array.from(
    new Set(
      (symbols || [])
        .filter((s) => typeof s === "string" && s.startsWith("NSE:"))
        .map((s) => s.trim())
    )
  );

  if (!out.length) {
    throw new Error("no valid NSE symbols to finalize");
  }

  const doc = {
    _id: key,
    symbols: out,
    source,
    createdAtIST: toIST(new Date()),
  };

  await db
    .collection("top_stock_symbols")
    .updateOne({ _id: key }, { $set: doc }, { upsert: true });

  return doc;
}

/** Read today's finalized symbols (may be null if not saved yet) */
export async function getFinalSymbolsToday() {
  const db = getDb();
  const key = istDateKey();
  return db.collection("top_stock_symbols").findOne({ _id: key });
}
