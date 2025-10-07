export function combine({ llm, tech, funda = { score: 0.5 }, weights }) {
  const sentiment = 0.6*(llm.bullishness ?? 0) + 0.4*(llm.relevance ?? 0);
  const catalyst  = (llm.catalyst_strength ?? 0) * Math.exp(- (llm.freshness_hours ?? 0) / 24);
  const momentum  = tech.momScore ?? 0;
  const liquidity = tech.liqScore ?? 0;
  const fundamentals = funda.score ?? 0.5;

  let total = (
    weights.sentiment*sentiment +
    weights.catalyst*catalyst +
    weights.momentum*momentum +
    weights.liquidity*liquidity +
    weights.fundamentals*fundamentals
  );

  const flags = llm.risk_flags || [];
  if (flags.includes("rumor")) total -= 0.05;
  if (flags.includes("low-confidence")) total -= 0.05;

  return { total, breakdown: { sentiment, catalyst, momentum, liquidity, fundamentals } };
}
