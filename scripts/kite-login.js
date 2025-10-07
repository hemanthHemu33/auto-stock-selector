// scripts\kite-login.js
import dotenv from "dotenv";
dotenv.config();

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import fs from "node:fs";
import path from "node:path";

// ESM/CJS compatible import
import pkg from "kiteconnect";
const KiteConnect = pkg?.KiteConnect ?? pkg?.default ?? pkg;
if (typeof KiteConnect !== "function") {
  console.error("[kite:login] Failed to import KiteConnect from 'kiteconnect'");
  process.exit(1);
}

const API_KEY = process.env.KITE_API_KEY;
const API_SECRET = process.env.KITE_API_SECRET;
if (!API_KEY || !API_SECRET) {
  console.error("[kite:login] KITE_API_KEY / KITE_API_SECRET missing in .env");
  process.exit(1);
}

const kite = new KiteConnect({ api_key: API_KEY });
const loginURL = kite.getLoginURL();

console.log("\n=== Zerodha Kite Login ===");
console.log("1) Open this URL in your browser and complete login + TOTP/PIN:");
console.log(loginURL);
console.log(
  "\n2) After login, you will be redirected to your app's redirect URL with a query param `request_token`."
);
console.log(
  "   Copy the value of `request_token` from the URL and paste it below.\n"
);

const rl = readline.createInterface({ input, output });
const requestToken = (await rl.question("Paste request_token: ")).trim();
await rl.close();

if (!requestToken) {
  console.error("[kite:login] request_token was empty. Aborting.");
  process.exit(1);
}

try {
  const session = await kite.generateSession(requestToken, API_SECRET);
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error("No access_token in session response");

  console.log("\n✅ Got access_token:", accessToken);
  const envPath = path.resolve(process.cwd(), ".env");
  let envText = "";
  try {
    envText = fs.readFileSync(envPath, "utf-8");
  } catch {}

  if (envText.includes("KITE_ACCESS_TOKEN=")) {
    envText = envText.replace(
      /KITE_ACCESS_TOKEN=.*/g,
      `KITE_ACCESS_TOKEN=${accessToken}`
    );
  } else {
    envText +=
      (envText.endsWith("\n") ? "" : "\n") +
      `KITE_ACCESS_TOKEN=${accessToken}\n`;
  }
  fs.writeFileSync(envPath, envText, "utf-8");
  console.log("📝 Wrote KITE_ACCESS_TOKEN to .env");
  console.log("Tip: restart your service so it picks up the new token.");
  process.exit(0);
} catch (e) {
  console.error("[kite:login] Failed to generate session:", e?.message || e);
  process.exit(1);
}
