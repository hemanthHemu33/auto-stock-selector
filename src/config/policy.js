export const POLICY = {
  // final blend between tech & news inside the picker (you added earlier)
  WEIGHTS: { tech: 0.7, news: 0.3 },

  // news candidate builder window & size
  NEWS_WINDOW_MIN: 120, // 90–120 min is typical
  NEWS_TOPN: 40,

  // basic news gates for "actionable"
  NEWS_GATES: {
    minScore: 0.25, // aggregated symbol news score
    minHits: 2, // at least 2 headlines
    maxAgeMin: 120, // last headline <= 120 min
  },

  // guardrails for candidate builder
  GUARDRAILS: {
    rumorPenalty: 0.15, // subtract if rumor-y wording
    minSourceCount: 2, // cluster must have >=2 unique sources, unless official
    cooldownMin: 30, // avoid re-pushing same symbol too often
    sectorDiversityMaxPerSector: 3, // cap in the final TOP_N
  },

  // scoring weights for the candidate builder
  NEWS_SCORE_WEIGHTS: {
    sourceQuality: 0.25,
    catalystImpact: 0.35,
    freshness: 0.25,
    specificity: 0.1,
    novelty: 0.05,
  },
};
