// FIX: go up two directories to reach src/config/env.js
import "../../config/env.js";
import OpenAI from "openai";

const KEY = process.env.OPENAI_API_KEY?.trim();
export const LLM_MODEL = (process.env.LLM_MODEL || "gpt-4.1-mini").trim();

let client = null;
try {
  if (KEY) {
    client = new OpenAI({ apiKey: KEY });
    console.log(`[openai] enabled model=${LLM_MODEL}`);
  } else {
    console.warn(
      "[openai] OPENAI_API_KEY missing — using rules-only fallbacks"
    );
  }
} catch (e) {
  console.error("[openai] init failed:", e?.message || e);
  client = null;
}

export const openai = client;
export const isLLMEnabled = () => !!client;
