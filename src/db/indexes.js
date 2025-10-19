// src/db/indexes.js
import { getDb } from "./mongo.js";

export async function ensureIndexes() {
  const db = getDb();

  await db.collection("news_raw").createIndex({ ts: -1 });
  await db.collection("news_events").createIndex({ ts: -1 });
  await db.collection("news_events").createIndex({ symbol: 1, ts: -1 });
  await db.collection("auto_picks").createIndex({ ts: -1 });

  // removed: _id index creation (Mongo creates this automatically and it's unique)
}
