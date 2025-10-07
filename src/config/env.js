// src\config\env.js

import dotenv from "dotenv";
dotenv.config();
if (!process.env.MONGO_URI) console.warn("[env] MONGO_URI is not set");
if (!process.env.OPENAI_API_KEY)
  console.warn("[env] OPENAI_API_KEY is not set");
if (!process.env.KITE_API_KEY) console.warn("[env] KITE_API_KEY is not set");
