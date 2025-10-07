import { buildSymbolMaps } from "../integrations/kite/instruments.js";
import {
  getLTP,
  getQuote,
  getHistoricalData,
} from "../integrations/kite/marketData.js";

function clamp(x, a = 0, b = 1) {
  return Math.max(a, Math.min(b, x));
}

export function computeTechScores(ctx) {
  const gapScore = clamp((ctx.gapPct ?? 0) / 0.03);
  // Momentum uses intraday windows; replace with your preferred blend
  const momBlend =
    0.5 * (ctx.ret5m ?? 0) + 0.3 * (ctx.ret15m ?? 0) + 0.2 * (ctx.ret60m ?? 0);
  const momScore = clamp(momBlend);
  const vwapScore = 1 - clamp(Math.abs(ctx.vwapDistPct ?? 0) / 0.01);
  const atrScore = 1 - clamp(((ctx.atrPct ?? 0) - 0.01) / 0.05);
  const liqScore = clamp(
    Math.min((ctx.avg1mVol ?? 0) / 200000, 1) *
      (1 - (ctx.spreadPct ?? 0) / 0.004)
  );
  return { gapScore, momScore, vwapScore, atrScore, liqScore };
}

export async function getScores(symbol) {
  // symbol is like "ADANIPOWER"
  const full = `NSE:${symbol}`;
  const { bySymbol } = await buildSymbolMaps();
  const row = bySymbol.get(full);
  if (!row)
    throw new Error(
      `Unknown symbol ${full}. Did you run kite:dump and have a fresh access token?`
    );
  const token = row.instrument_token;

  // Daily window for ATR/returns
  const to = new Date();
  const fromDaily = new Date(to);
  fromDaily.setDate(to.getDate() - 90);
  const daily = await getHistoricalData(
    token,
    fromDaily.toISOString(),
    to.toISOString(),
    "day"
  );
  if (!daily || daily.length < 22)
    throw new Error(`Not enough daily data for ${symbol}`);

  const prevClose =
    daily[daily.length - 2]?.close ?? daily[daily.length - 1]?.close;
  const lastClose = daily[daily.length - 1]?.close ?? prevClose;
  const ret3dIdx = Math.max(0, daily.length - 4);
  const ret20dIdx = Math.max(0, daily.length - 21);
  const ret3d = (lastClose - daily[ret3dIdx].close) / daily[ret3dIdx].close;
  const ret20d = (lastClose - daily[ret20dIdx].close) / daily[ret20dIdx].close;
  const atr = ATR14(daily);
  const atrPct = atr / (lastClose || 1);

  // Intraday minute data for VWAP, avg1mVol, intraday momentum
  const openTime = new Date(to);
  openTime.setHours(9, 15, 0, 0); // IST; set TZ=Asia/Kolkata in env for consistency
  const intraday = await getHistoricalData(
    token,
    openTime.toISOString(),
    to.toISOString(),
    "minute"
  );
  const { vwap, avg1mVol, ret5m, ret15m, ret60m, firstOpen, lastPrice } =
    computeIntraday(intraday);

  // LTP + Quote for spread
  const ltpMap = await getLTP([full]);
  const last = ltpMap[full]?.last_price ?? lastPrice ?? lastClose;

  const quote = await getQuote([full]);
  const depth = quote[full]?.depth;
  const bestBid = depth?.buy?.[0]?.price ?? last;
  const bestAsk = depth?.sell?.[0]?.price ?? last;
  const mid = (bestBid + bestAsk) / 2 || last;
  const spreadPct = mid ? (bestAsk - bestBid) / mid : 0.001;

  const gapPct =
    firstOpen && prevClose ? (firstOpen - prevClose) / prevClose : 0;
  const vwapDistPct = vwap ? (last - vwap) / vwap : 0;

  const scores = computeTechScores({
    gapPct,
    ret3d,
    ret20d,
    vwapDistPct,
    atrPct,
    avg1mVol,
    spreadPct,
    ret5m,
    ret15m,
    ret60m,
  });

  return scores;
}

function ATR14(daily) {
  const tr = [];
  for (let i = 1; i < daily.length; i++) {
    const h = daily[i].high,
      l = daily[i].low,
      cPrev = daily[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - cPrev), Math.abs(l - cPrev)));
  }
  const last14 = tr.slice(-14);
  if (!last14.length) return 0;
  return last14.reduce((a, b) => a + b, 0) / last14.length;
}

function computeIntraday(minuteBars) {
  if (!minuteBars?.length)
    return {
      vwap: null,
      avg1mVol: 0,
      ret5m: 0,
      ret15m: 0,
      ret60m: 0,
      firstOpen: null,
      lastPrice: null,
    };
  let pv = 0,
    v = 0;
  const n = minuteBars.length;
  for (const b of minuteBars) {
    const price = (b.high + b.low + b.close) / 3;
    pv += price * b.volume;
    v += b.volume;
  }
  const vwap = v ? pv / v : null;
  const avg1mVol = v / n;

  const closeNow = minuteBars[n - 1].close;
  const firstOpen = minuteBars[0].open;
  const p5 = minuteBars[Math.max(0, n - 5)].close;
  const p15 = minuteBars[Math.max(0, n - 15)].close;
  const p60 = minuteBars[Math.max(0, n - 60)].close;

  return {
    vwap,
    avg1mVol,
    firstOpen,
    lastPrice: closeNow,
    ret5m: (closeNow - p5) / p5,
    ret15m: (closeNow - p15) / p15,
    ret60m: (closeNow - p60) / p60,
  };
}
