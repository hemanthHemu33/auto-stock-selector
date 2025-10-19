import { Router } from "express";
import {
  refreshNewsOnce,
  topNewsMentions,
  remapFromRaw,
} from "../news/service.js";
import { isMarketOpenIST } from "../utils/marketHours.js";
import { getDb } from "../db/mongo.js";
import { mapTextToSymbols } from "../news/mapper.js";
import { RSS_SOURCES } from "../news/sources.js";
import { fetchRSSFeed } from "../news/rss.js";
// import { buildNewsCandidates } from "../news/candidates.js";
import { POLICY } from "../config/policy.js";
import { toIST } from "../utils/time.js";
import { buildNewsCandidates } from "../news/candidates.js";
import { isLLMEnabled } from "../integrations/openai/client.js";
const r = Router();

/**
 * ENRICHED: GET /api/news
 * Returns top symbols + sample headlines per symbol (joined with news_raw to include URLs).
 * Query:
 *   hours=24       - lookback window
 *   limit=40       - number of symbols
 *   samples=2      - headlines per symbol to include
 */

// round score to 2 decimals but keep it a number
function round2(x) {
  return Number.isFinite(x) ? Number(x.toFixed(2)) : x;
}
r.get("/", async (req, res, next) => {
  try {
    const hours = Number(req.query.hours || 24);
    const limit = Number(req.query.limit || 40);
    const samples = Math.max(1, Math.min(5, Number(req.query.samples || 2)));
    const live = isMarketOpenIST();

    // 1) ranked symbols
    const rows = await topNewsMentions({ hours, limit });
    if (!rows.length) {
      return res.json({
        ok: true,
        live,
        tz: "Asia/Kolkata",
        hours,
        limit,
        samples,
        rows: [],
      });
    }

    // 2) pull recent events & join with raw for URLs
    const db = getDb();
    const sinceISO = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const symbols = rows.map((r) => r.symbol);

    const ev = db.collection("news_events");
    const bySym = await ev
      .aggregate([
        { $match: { ts: { $gte: sinceISO }, symbol: { $in: symbols } } },
        { $sort: { ts: -1 } },
        {
          $lookup: {
            from: "news_raw",
            localField: "article_id",
            foreignField: "_id",
            as: "raw",
          },
        },
        {
          $addFields: {
            url: { $ifNull: [{ $arrayElemAt: ["$raw.url", 0] }, ""] },
          },
        },
        { $project: { raw: 0 } },
        {
          $group: {
            _id: "$symbol",
            samples: {
              $push: {
                title: "$title",
                ts: "$ts",
                source: "$source",
                url: "$url",
                score: "$score",
              },
            },
          },
        },
      ])
      .toArray();

    const sampleMap = new Map(
      bySym.map((x) => [
        x._id,
        x.samples.slice(0, samples).map((s) => ({
          ...s,
          ts: s.ts ? toIST(s.ts) : null, // <-- IST for each sample headline
          score: round2(s.score),
        })),
      ])
    );

    // 3) merge + IST for lastTs
    const enriched = rows.map((r) => ({
      ...r,
      score: round2(r.score),
      lastTs: r.lastTs ? toIST(r.lastTs) : null, // <-- IST for symbol’s last timestamp
      samples: sampleMap.get(r.symbol) || [],
    }));

    res.json({
      ok: true,
      live,
      tz: "Asia/Kolkata",
      hours,
      limit,
      samples,
      rows: enriched,
    });
  } catch (e) {
    next(e);
  }
});

// Lean top (machine-friendly)
r.get("/top", async (req, res, next) => {
  try {
    const hours = Number(req.query.hours || 24);
    const limit = Number(req.query.limit || 40);
    const rows = await topNewsMentions({ hours, limit });

    // Convert lastTs to IST here as well
    const rowsIST = rows.map((r) => ({
      ...r,
      score: round2(r.score),
      lastTs: r.lastTs ? toIST(r.lastTs) : null,
    }));

    res.json({
      ok: true,
      live: isMarketOpenIST(),
      tz: "Asia/Kolkata",
      rows: rowsIST,
    });
  } catch (e) {
    next(e);
  }
});

// GET/POST /api/news/refresh?perSourceCap=40&maxArticles=200&mapConcurrency=6
async function doRefresh(req, res, next) {
  try {
    const perSourceCap = Number(req.query.perSourceCap || 80);
    const maxArticles = Number(req.query.maxArticles || 500);
    const mapConcurrency = Number(req.query.mapConcurrency || 8);
    const out = await refreshNewsOnce({
      perSourceCap,
      maxArticles,
      mapConcurrency,
    });
    res.json(out);
  } catch (e) {
    next(e);
  }
}
r.post("/refresh", doRefresh);
r.get("/refresh", doRefresh);

// Counts + configured sources
r.get("/debug", async (_req, res, next) => {
  try {
    const db = getDb();
    const raw = await db.collection("news_raw").countDocuments();
    const ev = await db.collection("news_events").countDocuments();
    res.json({
      ok: true,
      tz: "Asia/Kolkata",
      counts: { news_raw: raw, news_events: ev },
      sources: RSS_SOURCES,
    });
  } catch (e) {
    next(e);
  }
});

// Quick mapping sanity check
r.get("/map-test", async (req, res, next) => {
  try {
    const text = String(req.query.text || "");
    const syms = await mapTextToSymbols(text);
    res.json({ ok: true, tz: "Asia/Kolkata", text, symbols: syms });
  } catch (e) {
    next(e);
  }
});

// Ping each source (no DB write) — add IST ts for samples if present later
r.get("/ping", async (_req, res, next) => {
  try {
    const out = [];
    for (const url of RSS_SOURCES) {
      const items = await fetchRSSFeed(url);
      out.push({
        url,
        items: items.length,
        sample: items.slice(0, 3).map((x) => ({
          ...x,
          ts: x.ts ? toIST(x.ts) : null, // <-- IST for preview samples
        })),
      });
    }
    res.json({ ok: true, tz: "Asia/Kolkata", results: out });
  } catch (e) {
    next(e);
  }
});

// Fetch one arbitrary URL to test connectivity
r.get("/fetch-one", async (req, res, next) => {
  try {
    const url = String(req.query.url || "");
    if (!url) return res.status(400).json({ ok: false, error: "missing url" });
    const items = await fetchRSSFeed(url);
    res.json({
      ok: true,
      tz: "Asia/Kolkata",
      url,
      items: items.length,
      sample: items
        .slice(0, 5)
        .map((x) => ({ ...x, ts: x.ts ? toIST(x.ts) : null })),
    });
  } catch (e) {
    next(e);
  }
});

// Remap recent raw → events (no refetch)
r.post("/remap", async (req, res, next) => {
  try {
    const limit = Number(req.query.limit || 300);
    const out = await remapFromRaw({ limit });
    res.json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
});

r.get("/candidates", async (req, res, next) => {
  try {
    const windowMin = Number(req.query.windowMin || POLICY.NEWS_WINDOW_MIN);
    const limit = Number(req.query.limit || POLICY.NEWS_TOPN);
    const symbols = req.query.symbols
      ? String(req.query.symbols)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : null;

    const rows = await buildNewsCandidates({ windowMin, limit, symbols });
    const rounded = rows.map((r) => ({
      ...r,
      score: Number(r.score.toFixed(2)),
      lastTs: r.lastTs ? toIST(r.lastTs) : null,
    }));
    res.json({ ok: true, windowMin, limit, rows: rounded });
  } catch (e) {
    next(e);
  }
});

// GET /api/news/candidates?windowMin=120&limit=40
r.get("/candidates", async (req, res, next) => {
  try {
    const windowMin = Number(req.query.windowMin || 120);
    const limit = Number(req.query.limit || 40);
    const rows = await buildNewsCandidates({ windowMin, limit });
    res.json({
      ok: true,
      live: isMarketOpenIST(),
      tz: "Asia/Kolkata",
      rows,
    });
  } catch (e) {
    next(e);
  }
});
r.get("/llm-status", (_req, res) => {
  res.json({
    ok: true,
    enabled: isLLMEnabled(),
    model: (process.env.LLM_MODEL || "gpt-4.1-mini").trim(),
  });
});
export default r;
