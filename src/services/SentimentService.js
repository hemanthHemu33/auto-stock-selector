import { getOpenAI, LLM_MODEL } from "../integrations/openai/client.js";

const client = getOpenAI();

function defaultGrade() {
  return {
    bullishness: 0.5,
    relevance: 0.4,
    catalyst_strength: 0.3,
    freshness_hours: 48,
    risk_flags: [],
    rationale: "LLM disabled — default grade.",
  };
}

export async function gradeArticle({
  symbol,
  headline,
  body = "",
  publishedAt = "",
}) {
  if (!client) return defaultGrade();

  // Moderation: best-effort
  try {
    await client.moderations.create({
      model: "omni-moderation-latest",
      input: `${headline}\n${body}`,
    });
  } catch {}

  const resp = await client.responses.create({
    model: LLM_MODEL,
    input: [
      {
        role: "system",
        content:
          "You are a strict equity news grader for Indian stocks. Output JSON only.",
      },
      {
        role: "user",
        content: `Grade the following item for ${symbol}.
Headline: ${headline}
Body: ${(body || "").slice(0, 3500)}
PublishedAt: ${publishedAt}

Return JSON with keys:
bullishness(0..1), relevance(0..1), catalyst_strength(0..1),
freshness_hours(number), risk_flags(string[]), rationale(string<=500).`,
      },
    ],
    response_format: { type: "json_object" },
  });

  try {
    return JSON.parse(resp.output_text || "{}");
  } catch {
    return defaultGrade();
  }
}
