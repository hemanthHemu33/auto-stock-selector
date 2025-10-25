// src/db/locks.js
import { getDb } from "./mongo.js";

const COLL = "locks";

/**
 * Acquire a simple daily lock:
 * - key: string (e.g., "publish:2025-10-24")
 * - ttlSecs: auto-expiry guard
 * Returns true if acquired, false if already taken.
 */
export async function acquireLock(key, ttlSecs = 1800) {
  const db = getDb();
  const now = new Date();
  const exp = new Date(now.getTime() + ttlSecs * 1000);

  const res = await db
    .collection(COLL)
    .findOneAndUpdate(
      { _id: key, expiresAt: { $gt: now } },
      { $setOnInsert: { _id: key, createdAt: now, expiresAt: exp } },
      { upsert: true, returnDocument: "after" }
    );

  // If doc existed before with expiresAt > now, lock was already taken
  // We consider it acquired only if it was inserted right now (createdAt == now)
  const createdAt = res?.value?.createdAt;
  if (!createdAt) return false;
  return Math.abs(new Date(createdAt).getTime() - now.getTime()) < 1500;
}
