import stringSimilarity from "string-similarity";

function norm(s) {
  return (s || "")
    .toLowerCase()
    .replace(
      /\b(limited|ltd|inc|co|the|a|an|to|for|of|and|on|in|with)\b/gi,
      " "
    )
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sim(a, b) {
  return stringSimilarity.compareTwoStrings(a, b);
}

/**
 * Cluster events per symbol using title similarity within a recent time window.
 * Each input event: { symbol, title, description, ts, source, url, article_id }
 */
export function clusterEvents(events, { windowMin = 120, simThr = 0.84 } = {}) {
  const bySym = new Map();
  for (const e of events) {
    if (!e?.symbol || !e?.title || !e?.ts) continue;
    const arr = bySym.get(e.symbol) || [];
    arr.push(e);
    bySym.set(e.symbol, arr);
  }

  const clusters = [];

  for (const [symbol, arr] of bySym) {
    arr.sort((a, b) => new Date(a.ts) - new Date(b.ts));
    const open = [];

    for (const ev of arr) {
      const t = new Date(ev.ts).getTime();
      const ntitle = norm(ev.title);

      // expire old open clusters
      for (let i = open.length - 1; i >= 0; i--) {
        if (t - open[i].lastTs > windowMin * 60000) {
          clusters.push(open[i]);
          open.splice(i, 1);
        }
      }

      // try attach to best matching open cluster
      let bestI = -1,
        bestS = -1;
      for (let i = 0; i < open.length; i++) {
        const c = open[i];
        const s = sim(ntitle, c.representative);
        if (s > bestS) {
          bestS = s;
          bestI = i;
        }
      }
      if (bestS >= simThr) {
        const c = open[bestI];
        c.items.push(ev);
        c.lastTs = t;
        c.sources.add(ev.source);
        // keep most "central" rep by checking new avg similarity (cheap heuristic)
        if (
          sim(ntitle, c.representative) >
          sim(norm(c.items[0].title), c.representative)
        ) {
          c.representative = ntitle;
        }
      } else {
        open.push({
          symbol,
          representative: ntitle,
          items: [ev],
          sources: new Set([ev.source]),
          firstTs: t,
          lastTs: t,
        });
      }
    }
    clusters.push(...open);
  }

  // finalize & format
  return clusters.map((c) => ({
    symbol: c.symbol,
    hits: c.items.length,
    sources: Array.from(c.sources),
    firstTs: new Date(c.firstTs).toISOString(),
    lastTs: new Date(c.lastTs).toISOString(),
    titles: c.items.map((x) => x.title),
    sample: c.items[0],
    articles: c.items.map((x) => ({
      article_id: x.article_id,
      url: x.url,
      source: x.source,
      ts: x.ts,
      title: x.title,
    })),
  }));
}
