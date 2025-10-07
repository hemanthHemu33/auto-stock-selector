// src/services/FastFilterService.js
import {
  getOHLCBatch,
  getQuoteBatch,
} from "../integrations/kite/marketData.js";

export async function shortlistUniverse(
  universe,
  {
    minPrice = 20,
    maxSpreadPct = 0.005, // live-only gate
    preferPositiveGap = true,
    limit = 80,
    requireDepth = true, // <-- NEW: if false, we don't drop when depth missing
  } = {}
) {
  const symbols = universe.map((u) => u.symbol);
  const [ohlcMap, quoteMap] = await Promise.all([
    getOHLCBatch(symbols),
    getQuoteBatch(symbols),
  ]);

  const rows = [];
  for (const u of universe) {
    const sym = u.symbol;
    const o = ohlcMap[sym];
    const q = quoteMap[sym];
    if (!o?.ohlc) continue;

    const last = o.last_price ?? o.ohlc?.close ?? null;
    const openToday = o.ohlc?.open ?? null;
    const prevClose = o.ohlc?.close ?? null; // Kite OHLC close is prev close
    if (!isFinite(last) || !isFinite(openToday) || !isFinite(prevClose))
      continue;

    // Depth (may be missing off-hours)
    const bid = q?.depth?.buy?.[0]?.price;
    const ask = q?.depth?.sell?.[0]?.price;
    let spreadPct = null;

    if (isFinite(bid) && isFinite(ask)) {
      const mid = (bid + ask) / 2;
      if (!isFinite(mid) || mid <= 0) continue;
      spreadPct = (ask - bid) / mid;
    } else if (requireDepth) {
      // live mode: skip if no depth
      continue;
    } else {
      // off-hours: leave spreadPct=null (we'll skip the spread gate & apply a neutral penalty in ranking)
      spreadPct = null;
    }

    const gapPct = (openToday - prevClose) / prevClose;
    const intradayPct = (last - openToday) / openToday;

    // quick gates
    if (last < minPrice) continue;
    if (preferPositiveGap && gapPct < -0.01) continue;
    if (requireDepth && spreadPct !== null && spreadPct > maxSpreadPct)
      continue;

    rows.push({
      symbol: sym,
      name: u.name,
      token: u.token,
      last,
      prevClose,
      openToday,
      gapPct,
      spreadPct,
      intradayPct,
    });
  }

  // Ranking: if spread is unknown, use a neutral penalty (e.g., 0.004)
  rows.sort((a, b) => {
    const sa = a.spreadPct == null ? 0.004 : a.spreadPct;
    const sb = b.spreadPct == null ? 0.004 : b.spreadPct;
    const ra = (a.gapPct || 0) + 0.8 * (a.intradayPct || 0) - 2 * sa;
    const rb = (b.gapPct || 0) + 0.8 * (b.intradayPct || 0) - 2 * sb;
    return rb - ra;
  });

  return rows.slice(0, Math.max(1, limit));
}
