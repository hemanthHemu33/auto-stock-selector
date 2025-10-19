import { getCoreUniverse } from "../integrations/kite/universe.js";

let INDEX = null;

export async function getSymbolIndex() {
  if (INDEX) return INDEX;
  const uni = await getCoreUniverse(); // 208
  // Build a normalized alias list for each symbol: tradingsymbol, company name variants
  const items = uni.map((u) => ({
    symbol: u.symbol, // e.g. NSE:RELIANCE
    base: u.symbol.split(":")[1],
    name: (u.name || "").toLowerCase(),
  }));

  const aliases = new Map(); // key=aliasLower → symbol
  for (const it of items) {
    const base = it.base;
    const name = it.name;
    const add = (k) => {
      if (k) aliases.set(k, it.symbol);
    };

    add(base.toLowerCase());
    add(name);

    // name variants: remove ltd/limited, punctuation, spaces
    const simple = name
      .replace(/\blimited\b|\bltd\b|\binc\b|\bco\b/gi, "")
      .replace(/[^a-z0-9]/gi, "")
      .trim();
    if (simple) add(simple);

    // common brand shorteners (extend as needed)
    if (base.endsWith("BANK")) add(`${base.toLowerCase()}`); // e.g. hdfcbank
  }

  INDEX = { aliases };
  return INDEX;
}
