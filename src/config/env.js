// src/config/env.js
import dotenv from "dotenv";
import path from "node:path";

// Always load .env from the project root where you run `npm start`
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// One concise line so you can see the status on boot (never print the key)
console.log(
  `[env] NODE_ENV=${process.env.NODE_ENV || "development"} ` +
    `PORT=${process.env.PORT || 8000} ` +
    `LLM_MODEL=${(process.env.LLM_MODEL || "gpt-4.1-mini").trim()} ` +
    `OPENAI_API_KEY=${process.env.OPENAI_API_KEY ? "set" : "missing"}`
);

export {};
