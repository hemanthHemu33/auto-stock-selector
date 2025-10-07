// src/integrations/kite/tokenFromMongo.js
import { MongoClient } from "mongodb";
import { setAccessToken } from "./kiteClient.js";

export async function initKiteAccessTokenFromMongo() {
  //   const uri = process.env.MONGO_URI;
  const uri =
    process.env.DB_URI ||
    `mongodb+srv://${process.env.DB_USER_NAME}:${process.env.DB_PASSWORD}@cluster0.53r8xqg.mongodb.net/?retryWrites=true&w=majority`;

  const dbName = process.env.DB_NAME || "scanner_app";
  if (!uri) {
    console.warn(
      "[kite] MONGO_URI missing; cannot load access token from Mongo"
    );
    return;
  }

  const client = new MongoClient(uri, { ignoreUndefined: true });
  try {
    await client.connect();
    const db = client.db(dbName);

    // Same shape your scanner uses in /kite-redirect upsert:
    // { type: "kite_session", access_token: "...", login_time: ... }
    const row = await db
      .collection("tokens")
      .findOne(
        { type: "kite_session" },
        { sort: { login_time: -1, _id: -1 }, projection: { access_token: 1 } }
      );

    if (!row?.access_token) {
      console.warn("[kite] No access_token found in Mongo tokens collection");
      return;
    }

    setAccessToken(row.access_token);
    process.env.KITE_ACCESS_TOKEN = row.access_token; // so other modules see it too
    console.log("[kite] Access token loaded from Mongo");
  } catch (e) {
    console.error("[kite] Failed to load access token from Mongo:", e.message);
  } finally {
    try {
      await client.close();
    } catch {}
  }
}
