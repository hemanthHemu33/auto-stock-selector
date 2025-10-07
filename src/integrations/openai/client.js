import OpenAI from "openai";
export const LLM_MODEL = process.env.LLM_MODEL || "gpt-4.1-mini";

/** Returns an OpenAI client or null if no API key (fallback mode). */
export function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.warn(
      "[openai] OPENAI_API_KEY missing — running in no-LLM fallback mode."
    );
    return null;
  }
  return new OpenAI({ apiKey: key });
}
