import fs from "node:fs";
import path from "node:path";
import { getKite } from "./kiteClient.js";

const DATA_FILE = path.resolve(process.cwd(), "data", "kite-instruments.json");

function fileMtimeMs(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

/** Load instruments from cache (24h) or fetch from Kite and cache */
export async function loadInstrumentsCached({
  maxAgeMs = 24 * 3600 * 1000,
} = {}) {
  const now = Date.now();
  if (fs.existsSync(DATA_FILE) && now - fileMtimeMs(DATA_FILE) < maxAgeMs) {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  }
  const kite = getKite();
  const all = await kite.getInstruments();
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(all, null, 2), "utf-8");
  return all;
}

/** Build quick lookup maps for NSE cash instruments */
export async function buildSymbolMaps() {
  const all = await loadInstrumentsCached();
  const nseCash = all.filter(
    (x) =>
      x.exchange === "NSE" &&
      (x.instrument_type === "EQ" || (x.segment ?? "").includes("NSE"))
  );
  const bySymbol = new Map(); // "NSE:ADANIPOWER" -> row
  const byToken = new Map(); // token -> row
  const byName = new Map(); // normalized company name -> Set(symbols)
  for (const x of nseCash) {
    const sym = `NSE:${x.tradingsymbol}`;
    bySymbol.set(sym, x);
    byToken.set(x.instrument_token, x);
    const key = normalize(x.name);
    if (!byName.has(key)) byName.set(key, new Set());
    byName.get(key).add(sym);
  }
  return { bySymbol, byToken, byName };
}

export function normalize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
