// src/news/scorer.js
import { openai, LLM_MODEL } from "../integrations/openai/client.js"; // <- correct import

const KEYWORDS = {
  positive: [
    "upgrade",
    "order",
    "contract",
    "wins",
    "approval",
    "debt reduction",
    "buyback",
    "merger",
    "acquisition",
    "strategic",
    "record",
    "guidance raised",
    "beats",
    "profit surges",
  ],
  negative: [
    "downgrade",
    "pledge",
    "default",
    "fraud",
    "raid",
    "penalty",
    "fine",
    "ban",
    "layoff",
    "loss widens",
    "misses",
    "guidance cut",
    "fire",
    "accident",
    "shutdown",
  ],
};

export function timeDecayScore(tsISO, halfLifeMinutes = 240) {
  const now = Date.now();
  const t = new Date(tsISO).getTime();
  const mins = Math.max(0, (now - t) / 60000);
  return Math.pow(0.5, mins / halfLifeMinutes);
}

export async function sentimentScoreLLM(title, description) {
  // If your client sets openai to null/undefined when no key, we fallback.
  if (!openai || !process.env.OPENAI_API_KEY) return null;
  try {
    const prompt =
      `Classify sentiment for intraday trading (positive/neutral/negative) and 1-5 impact score.\n` +
      `Return JSON: {"sentiment":"pos|neu|neg","impact":1-5}\n` +
      `Title: "${title}"\nBody: "${description}"`;
    const r = await openai.responses.create({
      model: LLM_MODEL || "gpt-4.1-mini",
      input: prompt,
      temperature: 0,
    });
    const text = r.output_text || "";
    const m = text.match(/"sentiment"\s*:\s*"(\w+)".*?"impact"\s*:\s*(\d+)/i);
    if (!m) return null;
    const sent = m[1].toLowerCase();
    const impact = Math.max(1, Math.min(5, parseInt(m[2], 10)));
    const base = sent === "pos" ? 1 : sent === "neg" ? -1 : 0;
    return base * (impact / 5);
  } catch {
    return null; // silently fall back to rules
  }
}

export async function sentimentScoreRule(title, description) {
  const t = `${title} ${description}`.toLowerCase();
  let s = 0;
  for (const k of KEYWORDS.positive) if (t.includes(k)) s += 1;
  for (const k of KEYWORDS.negative) if (t.includes(k)) s -= 1;
  return Math.max(-2, Math.min(2, s)) / 2; // [-1,1]
}

export async function computeArticleScore(article) {
  const decay = timeDecayScore(article.ts, 240); // 4h half-life
  const llm = await sentimentScoreLLM(article.title, article.description);
  const base =
    llm ?? (await sentimentScoreRule(article.title, article.description));
  return decay * base; // [-1,1]
}
