// src/services/NewsFactorService.js (replace map if you want the new pipeline)
import { buildNewsCandidates } from "../news/candidates.js";

export async function getNewsScoresForSymbols(
  symbols,
  { windowMin = 120 } = {}
) {
  if (!symbols?.length) return new Map();
  const rows = await buildNewsCandidates({ windowMin, limit: 400, symbols });
  const map = new Map();
  for (const r of rows) {
    // use the candidate's score directly; you can also carry hits/age if needed
    map.set(r.symbol, { score: r.score, hits: r.hits, ageMin: undefined });
  }
  return map;
}
