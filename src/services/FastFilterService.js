// src/services/FastFilterService.js
import { getKite } from "../integrations/kite/kiteClient.js";

const BATCH = 120;

export async function shortlistUniverse(
  universe,
  {
    minPrice = 20,
    maxSpreadPct = 0.006, // 0.6%
    preferPositiveGap = true,
    limit = 100,
    requireDepth = false,
  } = {}
) {
  if (!Array.isArray(universe) || universe.length === 0) return [];

  const kite = getKite();
  const instruments = universe.map((u) => u.symbol); // e.g. "NSE:RELIANCE"

  // 1) fetch quotes in batches
  const quotes = {};
  for (let i = 0; i < instruments.length; i += BATCH) {
    const slice = instruments.slice(i, i + BATCH);
    try {
      const q = await kite.quote(slice);
      Object.assign(quotes, q || {});
    } catch (e) {
      // swallow per-batch errors to keep best-effort behavior
    }
  }

  // 2) build rows with computed fields
  const rows = [];
  const bySym = new Map(universe.map((x) => [x.symbol, x]));
  for (const sym of instruments) {
    const q = quotes[sym];
    if (!q) {
      if (requireDepth) continue; // need depth/quote when live
      // no quote; skip silently off-hours
      continue;
    }

    const last = num(q.last_price);
    if (!isFinite(last) || last < minPrice) continue;

    const prevClose = num(q.ohlc?.close);
    const gap = prevClose > 0 ? (last - prevClose) / prevClose : 0;

    // Spread from top-of-book depth (if available)
    const bestBuy = num(q.depth?.buy?.[0]?.price);
    const bestSell = num(q.depth?.sell?.[0]?.price);
    let spreadPct = null;
    if (isFinite(bestBuy) && isFinite(bestSell) && last > 0) {
      spreadPct = Math.max(0, bestSell - bestBuy) / last;
    }

    if (requireDepth) {
      if (!isFinite(spreadPct)) continue; // need usable depth
      if (spreadPct > maxSpreadPct) continue;
    } else {
      // when depth is missing off-hours, we won't filter by spread
      if (isFinite(spreadPct) && spreadPct > maxSpreadPct) continue;
    }

    if (preferPositiveGap && gap < 0) continue;

    const base = bySym.get(sym) || { symbol: sym, name: "" };
    rows.push({
      symbol: base.symbol,
      name: base.name,
      last,
      prevClose,
      gap,
      spreadPct: isFinite(spreadPct) ? spreadPct : null,
    });
  }

  // 3) sort & cap: highest positive gap first, then tighter spreads
  rows.sort((a, b) => {
    const byGap = (b.gap || 0) - (a.gap || 0);
    if (byGap !== 0) return byGap;
    const sa = isFinite(a.spreadPct) ? a.spreadPct : 9e9;
    const sb = isFinite(b.spreadPct) ? b.spreadPct : 9e9;
    return sa - sb;
  });

  return rows.slice(0, limit);
}

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}
