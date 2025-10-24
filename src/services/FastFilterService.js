// src/services/FastFilterService.js
import { getKite } from "../integrations/kite/kiteClient.js";

/**
 * Build a fast shortlist using live quotes.
 * - Batches Kite getQuote calls (safe chunk size = 80)
 * - If requireDepth=true, keeps only symbols with depth & valid spread
 * - If fallback (no items), re-run with requireDepth=false & relaxed spread gate
 */
export async function shortlistUniverse(
  universe,
  {
    minPrice = 20,
    maxSpreadPct = 0.006, // 0.6% early gate (looser than final gate)
    preferPositiveGap = true, // soft preference
    limit = 80,
    requireDepth = true, // when market live, try depth first
  } = {}
) {
  const kite = getKite();
  const symbols = universe.map((u) => u.symbol);

  const quotes = await fetchQuotesBatched(kite, symbols, 80); // Map<symbol, quote>
  const rows = [];

  for (const base of universe) {
    const q = quotes.get(base.symbol);
    if (!q) continue;

    const last = num(q.last_price);
    if (!isFinite(last) || last < minPrice) continue;

    // prev close from ohlc if present
    const prevClose = num(q.ohlc?.close ?? q.close);
    const chgPct =
      isFinite(prevClose) && prevClose > 0 ? (last - prevClose) / prevClose : 0;

    // depth / spread if available
    const bestBid = num(q.depth?.buy?.[0]?.price);
    const bestAsk = num(q.depth?.sell?.[0]?.price);
    let spreadPct = null;
    if (isFinite(bestBid) && isFinite(bestAsk) && bestAsk > 0) {
      spreadPct = (bestAsk - bestBid) / bestAsk;
    }

    // If depth is required, drop items without usable spread
    if (requireDepth) {
      if (!(isFinite(spreadPct) && spreadPct >= 0)) continue;
      if (spreadPct > maxSpreadPct) continue;
    }

    rows.push({
      symbol: base.symbol,
      name: base.name,
      token: base.token,
      last,
      prevClose: isFinite(prevClose) ? prevClose : null,
      chgPct,
      spreadPct: isFinite(spreadPct) ? spreadPct : null,
      volume: num(q.volume), // day cumulative volume; used later if you want
      oi: num(q.oi), // optional
      tradable: q.tradable !== false, // from kite
    });
  }

  // If we lost everything due to depth gate, retry with relaxed constraints
  if (requireDepth && rows.length === 0) {
    // one soft fallback pass
    return shortlistUniverse(universe, {
      minPrice,
      maxSpreadPct: maxSpreadPct * 1.5, // slightly looser
      preferPositiveGap,
      limit,
      requireDepth: false,
    });
  }

  // Ranking: prefer gap up, then highest % change; keep top N
  rows.sort((a, b) => {
    // optional: push clearly illiquid (null spread) a bit lower
    const aNoDepth = a.spreadPct == null ? 1 : 0;
    const bNoDepth = b.spreadPct == null ? 1 : 0;
    if (aNoDepth !== bNoDepth) return aNoDepth - bNoDepth;

    // prefer positive gap
    if (preferPositiveGap) {
      const aPos = a.chgPct > 0 ? 1 : 0;
      const bPos = b.chgPct > 0 ? 1 : 0;
      if (aPos !== bPos) return bPos - aPos;
    }

    // then by absolute % move
    return Math.abs(b.chgPct) - Math.abs(a.chgPct);
  });

  return rows.slice(0, Math.max(1, Number(limit) || 80));
}

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}

async function fetchQuotesBatched(kite, symbols, chunkSize = 80) {
  const out = new Map();
  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunk = symbols.slice(i, i + chunkSize);
    try {
      const data = await kite.getQuote(chunk); // { 'NSE:RELIANCE': {...}, ... }
      for (const s of chunk) {
        const q = data?.[s];
        if (q) out.set(s, q);
      }
    } catch (e) {
      // Partial failures: try smaller sub-batches so one bad symbol doesn't kill the lot
      // Split chunk into halves once and retry
      if (chunk.length > 1) {
        const mid = Math.floor(chunk.length / 2);
        await safeQuoteInto(out, kite, chunk.slice(0, mid));
        await safeQuoteInto(out, kite, chunk.slice(mid));
      }
    }
  }
  return out;
}

async function safeQuoteInto(map, kite, syms) {
  try {
    const data = await kite.getQuote(syms);
    for (const s of syms) {
      const q = data?.[s];
      if (q) map.set(s, q);
    }
  } catch {
    // give up on this small set; ignore
  }
}
