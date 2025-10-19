// src/integrations/openai/client.js
import OpenAI from "openai";

let openai = null;
const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.warn(
    "[openai] OPENAI_API_KEY missing — running in no-LLM fallback mode."
  );
} else {
  openai = new OpenAI({ apiKey: key });
}

export { openai };
export const LLM_MODEL = process.env.LLM_MODEL || "gpt-4.1-mini";
