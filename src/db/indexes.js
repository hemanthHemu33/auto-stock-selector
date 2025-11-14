// src/db/indexes.js
import { getDb } from "./mongo.js";

/**
 * Create helpful indexes.
 * NOTE: Do NOT attempt to mark the _id index as unique (it's always unique).
 */
export async function ensureIndexes() {
  const db = getDb();

  // Picks by runId (one per timeslot), latest by createdAt
  await db.collection("auto_picks").createIndex({ runId: 1 }, { unique: true });
  await db.collection("auto_picks").createIndex({ createdAt: -1 });

  // Finalized list per date key
  await db
    .collection("auto_picks_final")
    .createIndex({ dateKey: 1 }, { unique: true });

  // Universe snapshots by date for fast lookups
  await db
    .collection("universe_core")
    .createIndex({ dateKey: 1 }, { unique: true });

  // Optional: quick lookup for instrument tokens
  await db
    .collection("instruments")
    .createIndex({ tradingsymbol: 1 }, { unique: true });

  console.log("[mongo] indexes ensured");
}
