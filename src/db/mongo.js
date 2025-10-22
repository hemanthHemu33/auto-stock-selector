// src/db/mongo.js
import { MongoClient } from "mongodb";

let client;
let db;
let createClient = (uri) => new MongoClient(uri, { ignoreUndefined: true });

export async function connectMongo() {
  if (db) return db;

  const uri = process.env.MONGO_URI;
  const dbName = process.env.DB_NAME || "scanner_app"; // <- SAME as scanner
  if (!uri) throw new Error("MONGO_URI missing");

  if (!client) {
    client = createClient(uri);
    await client.connect();
  }

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

export function __setMongoClientFactory(factory) {
  createClient = factory;
}

export function __resetMongoClientFactory() {
  createClient = (uri) => new MongoClient(uri, { ignoreUndefined: true });
}
