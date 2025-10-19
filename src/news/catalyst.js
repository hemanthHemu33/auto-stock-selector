import { openai, LLM_MODEL } from "../integrations/openai/client.js";

// Lightweight rules, used if no OpenAI key or as a fallback.
const RULES = [
  {
    tag: "earnings_beat",
    dir: "pos",
    kw: ["beats estimates", "beat estimates", "profit surges", "record profit"],
    impact: 0.8,
  },
  {
    tag: "earnings_miss",
    dir: "neg",
    kw: ["misses estimates", "loss widens", "profit falls"],
    impact: 0.8,
  },
  {
    tag: "order_win",
    dir: "pos",
    kw: ["wins order", "bags order", "contract win", "secures order"],
    impact: 0.7,
  },
  {
    tag: "regulatory_ok",
    dir: "pos",
    kw: ["approval", "clears", "green light", "nod from"],
    impact: 0.7,
  },
  {
    tag: "pledge_increase",
    dir: "neg",
    kw: ["promoter pledge", "pledge increased"],
    impact: 0.7,
  },
  {
    tag: "pledge_release",
    dir: "pos",
    kw: ["pledge reduced", "pledge released"],
    impact: 0.5,
  },
  { tag: "buyback", dir: "pos", kw: ["buyback"], impact: 0.5 },
  {
    tag: "mna",
    dir: "pos",
    kw: ["acquisition", "merger", "amalgamation"],
    impact: 0.4,
  },
  { tag: "downgrade", dir: "neg", kw: ["downgrade"], impact: 0.6 },
  { tag: "upgrade", dir: "pos", kw: ["upgrade"], impact: 0.6 },
  {
    tag: "raid_fraud",
    dir: "neg",
    kw: ["raid", "fraud", "probe", "ed raids", "cbi raids"],
    impact: 0.9,
  },
  {
    tag: "accident_fire",
    dir: "neg",
    kw: ["fire", "accident", "blast", "shutdown"],
    impact: 0.8,
  },
];

function rulesTag(title, description) {
  const t = `${title} ${description}`.toLowerCase();
  for (const r of RULES) {
    if (r.kw.some((k) => t.includes(k))) {
      return {
        catalyst: r.tag,
        direction: r.dir,
        impact: r.impact,
        confidence: 0.6,
        via: "rules",
      };
    }
  }
  return {
    catalyst: "other",
    direction: "neu",
    impact: 0.2,
    confidence: 0.4,
    via: "rules",
  };
}

export async function tagCatalyst({ title, description }) {
  if (!openai || !process.env.OPENAI_API_KEY)
    return rulesTag(title, description);

  const prompt = `Classify the main catalyst for this stock headline for intraday trading.
Return compact JSON: {"catalyst":"earnings_beat|earnings_miss|order_win|regulatory_ok|buyback|mna|upgrade|downgrade|pledge_increase|pledge_release|raid_fraud|accident_fire|other","direction":"pos|neg|neu","impact":0.0-1.0}

Title: "${title}"
Body: "${description}"`;

  try {
    const r = await openai.responses.create({
      model: LLM_MODEL || "gpt-4.1-mini",
      input: prompt,
      temperature: 0,
    });
    const text = r.output_text || "";
    const m = text.match(
      /"catalyst"\s*:\s*"([^"]+)".*?"direction"\s*:\s*"([^"]+)".*?"impact"\s*:\s*([\d.]+)/is
    );
    if (!m) return rulesTag(title, description);
    const catalyst = m[1];
    const direction = m[2];
    const impact = Math.max(0, Math.min(1, Number(m[3])));
    return { catalyst, direction, impact, confidence: 0.8, via: "llm" };
  } catch {
    return rulesTag(title, description);
  }
}
