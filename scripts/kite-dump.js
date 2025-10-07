import dotenv from "dotenv";
dotenv.config();

import fs from "node:fs";
import path from "node:path";

// ESM/CJS compatible import
import pkg from "kiteconnect";
const KiteConnect = pkg?.KiteConnect ?? pkg?.default ?? pkg;
if (typeof KiteConnect !== "function") {
  console.error("[kite:dump] Failed to import KiteConnect from 'kiteconnect'");
  process.exit(1);
}

const API_KEY = process.env.KITE_API_KEY;
const ACCESS_TOKEN = process.env.KITE_ACCESS_TOKEN;
if (!API_KEY || !ACCESS_TOKEN) {
  console.error(
    "[kite:dump] Missing KITE_API_KEY or KITE_ACCESS_TOKEN in .env"
  );
  process.exit(1);
}

const kite = new KiteConnect({ api_key: API_KEY });
kite.setAccessToken(ACCESS_TOKEN);

try {
  console.log("[kite:dump] Fetching instruments...");
  const all = await kite.getInstruments();
  const outDir = path.resolve(process.cwd(), "data");
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, "kite-instruments.json");
  fs.writeFileSync(file, JSON.stringify(all, null, 2), "utf-8");
  console.log("✅ Saved:", file, `(${all.length} rows)`);
} catch (e) {
  console.error("[kite:dump] Failed:", e?.message || e);
  process.exit(1);
}
