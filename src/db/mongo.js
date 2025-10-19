// src/db/mongo.js
import { MongoClient } from "mongodb";

let client;
let db;

export async function connectMongo() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.DB_NAME || "scanner_app"; // <- SAME as scanner
  if (!uri) throw new Error("MONGO_URI missing");

  client = new MongoClient(uri, { ignoreUndefined: true });
  await client.connect();
  db = client.db(dbName);
  console.log(`[mongo] connected db=${dbName}`);
  return db;
}

export function getDb() {
  if (!db) throw new Error("Mongo not connected; call connectMongo() first");
  return db;
}

export async function closeMongo() {
  try {
    await client?.close();
  } catch {}
  client = undefined;
  db = undefined;
}
