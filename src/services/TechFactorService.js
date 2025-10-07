import { getKite } from "../integrations/kite/kiteClient.js";

function clamp(x, a = 0, b = 1) {
  return Math.max(a, Math.min(b, x));
}

export async function getTechScoresForSymbol(row) {
  // row = { symbol: "NSE:XYZ", token, ... }
  const kite = getKite();

  // --- Daily candles (ATR context)
  const to = new Date();
  const fromDaily = new Date(to);
  fromDaily.setDate(to.getDate() - 90);
  const daily = await kite.getHistoricalData(
    row.token,
    fromDaily.toISOString(),
    to.toISOString(),
    "day"
  );
  if (!daily?.length) throw new Error("no daily history");

  const prevClose = daily.at(-2)?.close ?? daily.at(-1)?.close;
  const lastClose = daily.at(-1)?.close ?? prevClose;
  const atr = ATR14(daily);
  const atrPct = atr / (lastClose || 1);

  // --- Intraday minute data
  const openTime = new Date(to);
  openTime.setHours(9, 15, 0, 0);
  const intraday = await kite.getHistoricalData(
    row.token,
    openTime.toISOString(),
    to.toISOString(),
    "minute"
  );

  const {
    vwap,
    avg1mVol,
    ret5m,
    ret15m,
    ret60m,
    firstOpen,
    lastPrice: closeNow,
  } = computeIntraday(intraday);

  // --- LTP + Quote for spread
  const ltpMap = await kite.getLTP([row.symbol]);
  const last = ltpMap[row.symbol]?.last_price ?? closeNow ?? lastClose;

  const quote = await kite.getQuote([row.symbol]);
  const depth = quote[row.symbol]?.depth;
  const bestBid = depth?.buy?.[0]?.price ?? last;
  const bestAsk = depth?.sell?.[0]?.price ?? last;
  const mid = (bestBid + bestAsk) / 2 || last;
  const spreadPct = mid ? (bestAsk - bestBid) / mid : 0.001;

  // --- Derived features
  const gapPct =
    firstOpen && prevClose ? (firstOpen - prevClose) / prevClose : 0;
  const vwapDistPct = vwap ? (last - vwap) / vwap : 0;

  // --- Scores
  const momBlend =
    0.5 * (ret5m || 0) + 0.3 * (ret15m || 0) + 0.2 * (ret60m || 0);
  const momScore = clamp(momBlend);
  const vwapScore = 1 - clamp(Math.abs(vwapDistPct) / 0.01);
  const atrScore = 1 - clamp((atrPct - 0.01) / 0.05);
  const liqScore = clamp(
    Math.min((avg1mVol || 0) / 200000, 1) * (1 - (spreadPct || 0) / 0.004)
  );
  const gapScore = clamp(gapPct / 0.03);

  const techTotal =
    0.55 * momScore + 0.25 * liqScore + 0.1 * vwapScore + 0.1 * atrScore;

  return {
    symbol: row.symbol,
    name: row.name, // <-- add this
    token: row.token,
    last,
    prevClose,
    firstOpen,
    gapPct,
    vwapDistPct,
    atrPct,
    avg1mVol,
    spreadPct,
    ret5m,
    ret15m,
    ret60m,
    scores: { momScore, vwapScore, atrScore, liqScore, gapScore, techTotal },
  };
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
  return last14.length ? last14.reduce((a, b) => a + b, 0) / last14.length : 0;
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
  for (const b of minuteBars) {
    const price = (b.high + b.low + b.close) / 3;
    pv += price * b.volume;
    v += b.volume;
  }
  const vwap = v ? pv / v : null;
  const n = minuteBars.length;
  const avg1mVol = v / n;
  const lastPrice = minuteBars[n - 1].close;
  const firstOpen = minuteBars[0].open;
  const p5 = minuteBars[Math.max(0, n - 5)].close;
  const p15 = minuteBars[Math.max(0, n - 15)].close;
  const p60 = minuteBars[Math.max(0, n - 60)].close;
  return {
    vwap,
    avg1mVol,
    lastPrice,
    firstOpen,
    ret5m: (lastPrice - p5) / p5,
    ret15m: (lastPrice - p15) / p15,
    ret60m: (lastPrice - p60) / p60,
  };
}
