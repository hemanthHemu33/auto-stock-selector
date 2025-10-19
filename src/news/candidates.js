import { getDb } from "../db/mongo.js";
import { sourceWeight, isOfficial } from "./quality.js";
import { tagCatalyst } from "./catalyst.js";
import { timeDecayScore } from "./scorer.js";
import { clusterEvents } from "./cluster.js";
import { POLICY } from "../config/policy.js";

// rumor-ish heuristics
const RUMOR_WORDS = [
  "reportedly",
  "sources say",
  "may",
  "considering",
  "mulling",
  "rumour",
  "rumor",
  "speculation",
];

function rumorPenalty(title, description) {
  const t = `${title} ${description}`.toLowerCase();
  return RUMOR_WORDS.some((w) => t.includes(w))
    ? POLICY.GUARDRAILS.rumorPenalty
    : 0;
}

// naive specificity: single mapped symbol headlines are more specific
function specificityScore(cluster) {
  // we cluster per symbol, but headlines sometimes mention many co's; here we use #different co mentions from titles as proxy
  // simple: if most titles include the base symbol name → 1 else 0.6
  return 1.0; // you already map per symbol tightly; keep simple
}

async function recentSymbolCount(db, symbol, sinceISO) {
  return db
    .collection("news_events")
    .countDocuments({ symbol, ts: { $gte: sinceISO } });
}

function buildReasons({ srcQ, cat, fresh, spec, novelty, rpen, minSourcesOK }) {
  const reasons = [];
  reasons.push(`srcQ:${srcQ.toFixed(2)}`);
  reasons.push(
    `catalyst:${cat.catalyst}(${cat.direction},${cat.impact.toFixed(2)})`
  );
  reasons.push(`fresh:${fresh.toFixed(2)}`);
  reasons.push(`spec:${spec.toFixed(2)}`);
  reasons.push(`novel:${novelty.toFixed(2)}`);
  if (rpen > 0) reasons.push(`rumor_penalty:${rpen.toFixed(2)}`);
  if (!minSourcesOK) reasons.push("min_sources_not_met");
  return reasons;
}
export async function buildNewsCandidates({
  windowMin = POLICY.NEWS_WINDOW_MIN,
  limit = POLICY.NEWS_TOPN,
  symbols = null,
} = {}) {
  const db = getDb();
  const since = new Date(Date.now() - windowMin * 60000).toISOString();

  // pull recent events joined to raw (for url/source/title/desc)
  const ev = await db
    .collection("news_events")
    .aggregate([
      {
        $match: {
          ts: { $gte: since },
          ...(symbols ? { symbol: { $in: symbols } } : {}),
        },
      },
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
          description: {
            $ifNull: [{ $arrayElemAt: ["$raw.description", 0] }, ""],
          },
        },
      },
      { $project: { raw: 0 } },
    ])
    .toArray();

  if (!ev.length) return [];

  // cluster per symbol
  const clusters = clusterEvents(ev, { windowMin, simThr: 0.84 });

  // score clusters
  const scored = [];
  for (const c of clusters) {
    const last = c.lastTs;

    const hostWeights = (c.sources || []).map((h) => sourceWeight(h));
    const srcQ = hostWeights.length
      ? hostWeights.reduce((a, b) => a + b, 0) / hostWeights.length
      : 0.6;

    // catalyst on cluster sample (or most recent)
    const headline = c.articles?.[0] || c.sample || { title: "", url: "" };
    const cat = await tagCatalyst({ title: headline.title, description: "" });

    const fresh = timeDecayScore(last, 120); // 2h half-life for the cluster
    const spec = specificityScore(c);

    // novelty: fewer same-symbol clusters in this window → higher novelty
    const sameCount = clusters.filter((x) => x.symbol === c.symbol).length;
    const novelty = sameCount > 0 ? Math.max(0, 1 - (sameCount - 1) / 5) : 1;

    // rumor penalty
    const rpen = rumorPenalty(headline.title, "");

    // guardrail: min sources unless official
    const minSourcesOK =
      (c.sources && isOfficial(c.sources[0])) ||
      new Set(c.sources || []).size >= POLICY.GUARDRAILS.minSourceCount;

    const w = POLICY.NEWS_SCORE_WEIGHTS;
    let score =
      w.sourceQuality * srcQ +
      w.catalystImpact *
        (cat.impact *
          (cat.direction === "neg" ? -1 : cat.direction === "pos" ? 1 : 0.2)) +
      w.freshness * fresh +
      w.specificity * spec +
      w.novelty * novelty;

    score -= rpen;

    const candidate = {
      symbol: c.symbol,
      score,
      lastTs: last,
      hits: c.hits,
      sources: c.sources || [],
      catalyst: cat.catalyst,
      direction: cat.direction,
      impact: cat.impact,
      catalyst_via: cat.via,
      freshness: fresh,
      specificity: spec,
      novelty,
      rumorPenalty: rpen,
      sampleTitle: headline.title,
      sampleUrl: headline.url || "",
      reasons: buildReasons({
        srcQ,
        cat,
        fresh,
        spec,
        novelty,
        rpen,
        minSourcesOK,
      }),
      _debug: { titles: (c.titles || []).slice(0, 3) },
    };

    if (minSourcesOK) scored.push(candidate);
  }

  // cooldown: drop symbols picked very recently
  const picksSince = new Date(
    Date.now() - POLICY.GUARDRAILS.cooldownMin * 60000
  ).toISOString();
  const recentPicks = await db
    .collection("auto_picks")
    .find({ ts: { $gte: picksSince } })
    .project({ "pick.symbol": 1, "top5.symbol": 1 })
    .toArray();

  const cooled = new Set();
  for (const p of recentPicks) {
    if (p.pick?.symbol) cooled.add(p.pick.symbol);
    for (const t of p.top5 || []) cooled.add(t.symbol);
  }

  const afterCooldown = scored.filter((x) => !cooled.has(x.symbol));

  // sector diversity (optional)
  const perSectorCap = POLICY.GUARDRAILS.sectorDiversityMaxPerSector || 0;
  let finalList = afterCooldown;

  if (perSectorCap > 0) {
    const bySec = new Map();
    const diversified = [];
    // sort once before applying sector cap
    afterCooldown.sort((a, b) => b.score - a.score);
    for (const c of afterCooldown) {
      const sec = getSector(c.symbol);
      const cnt = bySec.get(sec) || 0;
      if (cnt >= perSectorCap) continue;
      bySec.set(sec, cnt + 1);
      diversified.push(c);
      if (diversified.length >= limit) break;
    }
    finalList = diversified;
  }

  // final sort & cap
  finalList.sort((a, b) => b.score - a.score);
  return finalList.slice(0, limit);
}
