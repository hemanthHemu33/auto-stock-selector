import crypto from "node:crypto";
import { RSS_SOURCES } from "./sources.js";
import { fetchRSSFeed } from "./rss.js";
import { mapTextToSymbols } from "./mapper.js";
import { computeArticleScore } from "./scorer.js";
import { getDb } from "../db/mongo.js";
// import "./jobs/schedule.js";

function hash(s) {
  return crypto.createHash("sha1").update(s).digest("hex");
}

export async function refreshNewsOnce({
  perSourceCap = 80,
  maxArticles = 500,
  mapConcurrency = 8,
} = {}) {
  const db = getDb();
  const rawCol = db.collection("news_raw");
  const evCol = db.collection("news_events");

  console.time("[news] refresh");

  // 1) fetch all sources in parallel (with per-source cap)
  const results = await Promise.allSettled(
    RSS_SOURCES.map(async (url) => {
      const items = await fetchRSSFeed(url);
      const capped = items.slice(0, perSourceCap);
      return { url, items: capped };
    })
  );

  const bySource = [];
  let articles = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      const { url, items } = r.value;
      bySource.push({ url, ok: true, items: items.length });
      articles.push(...items);
    } else {
      bySource.push({ url: "unknown", ok: false, error: String(r.reason) });
    }
  }

  // 2) global cap to avoid huge runs
  if (articles.length > maxArticles) articles = articles.slice(0, maxArticles);

  // 3) upsert raw
  const opsRaw = articles.map((a) => ({
    updateOne: {
      filter: { _id: hash(a.url || a.title) },
      update: { $setOnInsert: { _id: hash(a.url || a.title), ...a } },
      upsert: true,
    },
  }));
  let rawUpserts = 0;
  if (opsRaw.length) {
    const res = await rawCol
      .bulkWrite(opsRaw, { ordered: false })
      .catch(() => null);
    rawUpserts = res?.upsertedCount ?? res?.nUpserted ?? 0;
  }

  // 4) map & score with small concurrency (prevents CPU spikes)
  const opsEv = [];
  let mappedPairs = 0;
  let i = 0;
  const workers = Array.from(
    { length: Math.max(1, mapConcurrency) },
    async () => {
      while (i < articles.length) {
        const idx = i++;
        const a = articles[idx];
        try {
          const id = hash(a.url || a.title);
          const syms = await mapTextToSymbols(`${a.title} ${a.description}`);
          if (!syms.length) continue;
          const score = await computeArticleScore(a);
          for (const sym of syms) {
            mappedPairs++;
            opsEv.push({
              updateOne: {
                filter: { _id: `${id}:${sym}` },
                update: {
                  $setOnInsert: {
                    _id: `${id}:${sym}`,
                    article_id: id,
                    symbol: sym,
                    ts: a.ts,
                    title: a.title,
                    source: a.source,
                    score,
                  },
                },
                upsert: true,
              },
            });
          }
        } catch {
          /* swallow per-article errors */
        }
      }
    }
  );
  await Promise.all(workers);

  let eventUpserts = 0;
  if (opsEv.length) {
    const res = await evCol
      .bulkWrite(opsEv, { ordered: false })
      .catch(() => null);
    eventUpserts = res?.upsertedCount ?? res?.nUpserted ?? 0;
  }

  console.timeEnd("[news] refresh");
  return {
    ok: true,
    sources: bySource,
    totalFetched: articles.length,
    rawUpserts,
    mappedPairs,
    eventUpserts,
  };
}

export async function topNewsMentions({ hours = 24, limit = 40 } = {}) {
  const db = getDb();
  const evCol = db.collection("news_events");
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const pipeline = [
    { $match: { ts: { $gte: since } } },
    {
      $group: {
        _id: "$symbol",
        score: { $sum: "$score" },
        hits: { $sum: 1 },
        lastTs: { $max: "$ts" },
      },
    },
    { $sort: { score: -1, hits: -1, lastTs: -1 } },
    { $limit: limit },
  ];
  const rows = await evCol.aggregate(pipeline).toArray();
  return rows.map((r) => ({
    symbol: r._id,
    score: r.score,
    hits: r.hits,
    lastTs: r.lastTs,
  }));
}

export async function remapFromRaw({ limit = 300 } = {}) {
  const db = getDb();
  const rawCol = db.collection("news_raw");
  const evCol = db.collection("news_events");

  const items = await rawCol.find({}).sort({ ts: -1 }).limit(limit).toArray();

  const opsEv = [];
  let mappedPairs = 0;

  for (const a of items) {
    const id =
      a._id ||
      crypto
        .createHash("sha1")
        .update(a.url || a.title)
        .digest("hex");
    const syms = await mapTextToSymbols(`${a.title} ${a.description}`);
    if (!syms.length) continue;

    const score = await computeArticleScore(a);
    for (const sym of syms) {
      mappedPairs++;
      opsEv.push({
        updateOne: {
          filter: { _id: `${id}:${sym}` },
          update: {
            $setOnInsert: {
              _id: `${id}:${sym}`,
              article_id: id,
              symbol: sym,
              ts: a.ts,
              title: a.title,
              source: a.source,
              score,
            },
          },
          upsert: true,
        },
      });
    }
  }

  let eventUpserts = 0;
  if (opsEv.length) {
    const res = await evCol
      .bulkWrite(opsEv, { ordered: false })
      .catch(() => null);
    eventUpserts = res?.nUpserted ?? 0;
  }

  return { scanned: items.length, mappedPairs, eventUpserts };
}
