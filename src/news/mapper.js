import stringSimilarity from "string-similarity";
import { getSymbolIndex } from "./symbolIndex.js";

export async function mapTextToSymbols(text, { max = 5 } = {}) {
  const idx = await getSymbolIndex();
  const q = normalize(text);

  // exact alias hits
  const hits = new Set();
  for (const [alias, sym] of idx.aliases) {
    if (q.includes(alias)) hits.add(sym);
    if (hits.size >= max) break;
  }
  if (hits.size) return Array.from(hits);

  // fallback fuzzy: compare each alias to each token window
  const tokens = q.split(/\s+/).filter(Boolean);
  const windows = new Set();
  for (let n = 1; n <= 3 && n <= tokens.length; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      windows.add(tokens.slice(i, i + n).join(""));
    }
  }

  const scored = [];
  for (const [alias, sym] of idx.aliases) {
    for (const w of windows) {
      const s = stringSimilarity.compareTwoStrings(alias, w);
      if (s >= 0.88) scored.push({ sym, s });
    }
  }
  scored.sort((a, b) => b.s - a.s);
  const out = [];
  const seen = new Set();
  for (const r of scored)
    if (!seen.has(r.sym)) {
      seen.add(r.sym);
      out.push(r.sym);
      if (out.length >= max) break;
    }
  return out;
}

function normalize(t) {
  return (t || "")
    .toLowerCase()
    .replace(/\blimited\b|\bltd\b|\binc\b|\bco\b/gi, "")
    .replace(/[^a-z0-9\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
