import selection from "../config/selection.js";
import AutoPick from "../db/models/AutoPick.js";
import { NewsIngestorService } from "./NewsIngestorService.js";
import { gradeArticle } from "./SentimentService.js";
import { getScores as getTechScores } from "./TechFactorService.js";
import { combine } from "./CombineService.js";

const news = new NewsIngestorService();

function passFilters(tech, filters){
  // Simple liquidity-only filter for v1
  return (tech && (tech.liqScore ?? 0) > 0.2);
}
function aggregateLLM(graded){
  if (!graded.length) return { bullishness:0.5, relevance:0.4, catalyst_strength:0.3, freshness_hours:48, risk_flags:[], rationale:"No fresh news; using defaults." };
  const top = [...graded].sort((a,b)=> (b.catalyst_strength||0)-(a.catalyst_strength||0)).slice(0,3);
  const avg = k => top.reduce((s,x)=>s+(x[k]||0),0)/top.length;
  return {
    bullishness:avg("bullishness"),
    relevance:avg("relevance"),
    catalyst_strength:avg("catalyst_strength"),
    freshness_hours:avg("freshness_hours"),
    risk_flags:[...new Set(top.flatMap(x=>x.risk_flags||[]))],
    rationale: top[0]?.rationale || ""
  };
}

export class AutoPickerService {
  async run(runType="preopen") {
    const { watchlist, filters, weights } = selection;

    await news.ingestForSymbols(watchlist, 48); // non-blocking later

    const candidates = [];
    for (const symbol of watchlist) {
      if (filters.banList.includes(symbol)) continue;

      const items = await news.latestForSymbol(symbol, 36);
      const graded = [];
      for (const a of items) {
        try {
          const g = await gradeArticle({ symbol, headline: a.headline, body: a.body, publishedAt: a.ts?.toISOString?.() });
          graded.push({ ...g, article: { articleId: String(a._id), url: a.url, headline: a.headline } });
        } catch { /* ignore single-article errors */ }
      }
      const llmAgg = aggregateLLM(graded);
      const tech = await getTechScores(symbol);
      if (!passFilters(tech, filters)) continue;

      const funda = { score: 0.5 }; // placeholder
      const combined = combine({ llm: llmAgg, tech, funda, weights });

      const topFactors = [
        llmAgg.catalyst_strength > 0.6 ? "Strong catalyst" : "Weak catalyst",
        `Momentum:${(tech.momScore*100|0)}%`,
        `Liquidity:${(tech.liqScore*100|0)}%`
      ];
      candidates.push({ symbol, total: combined.total, breakdown: combined.breakdown, topFactors, articles: graded.map(g=>g.article) });
    }

    if (!candidates.length) throw new Error("No candidates passed filters");

    candidates.sort((a,b)=> b.total - a.total);
    const pick = candidates[0];

    const today = new Date().toISOString().slice(0,10);
    const doc = await AutoPick.create({
      date: today,
      runType,
      symbol: pick.symbol,
      totalScore: pick.total,
      breakdown: pick.breakdown,
      inputs: { topFactors: pick.topFactors, articles: pick.articles },
      tieBreakers: [],
      decidedAt: new Date()
    });

    return doc;
  }

  async latest() {
    const today = new Date().toISOString().slice(0,10);
    return await AutoPick.findOne({ date: today }).sort({ decidedAt: -1 });
  }
}
