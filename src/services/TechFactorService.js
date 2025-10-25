import { getKite } from "../integrations/kite/kiteClient.js";
import { isMarketOpenIST, minutesSinceOpenIST } from "../utils/marketHours.js";
function clamp(x, a = 0, b = 1) {
  return Math.max(a, Math.min(b, x));
}

export async function getTechScoresForSymbol(row) {
  const kite = getKite();
  const token = Number(row.token);
  if (!token) return null;

  // 1) Live quote + depth (fast)
  let q;
  try {
    const m = await kite.getQuote([token]);
    q = m?.[token];
  } catch {
    return null;
  }
  if (!q) return null;

  const last = n(q.last_price);
  const ohlc = q.ohlc || {};
  const open = n(ohlc.open);
  const prevClose = n(ohlc.close);

  // Spread from depth (fallback to modest default if missing)
  let spreadPct = null;
  try {
    const bestBid = n(q.depth?.buy?.[0]?.price);
    const bestAsk = n(q.depth?.sell?.[0]?.price);
    if (bestBid > 0 && bestAsk > 0) {
      const mid = (bestBid + bestAsk) / 2;
      spreadPct = mid > 0 ? (bestAsk - bestBid) / mid : null;
    }
  } catch {}
  if (spreadPct == null) spreadPct = 0.0025; // 0.25% fallback

  // Avg 1-minute volume estimate (live): total volume today / minutes since open
  let avg1mVol = 0;
  const volToday = n(q.volume || q.volume_traded);
  if (volToday > 0 && isMarketOpenIST()) {
    const mins = Math.max(1, minutesSinceOpenIST());
    avg1mVol = Math.round(volToday / mins);
  }

  // 2) ATR% from recent daily bars (short window; rate-limit friendly)
  let atrPct = null;
  try {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 20);
    const daily = await kite.getHistoricalData(
      token,
      from.toISOString(),
      to.toISOString(),
      "day"
    );
    if (Array.isArray(daily) && daily.length >= 15 && last > 0) {
      const trs = [];
      for (let i = 1; i < daily.length; i++) {
        const d = daily[i];
        const p = daily[i - 1];
        const tr1 = n(d.high) - n(d.low);
        const tr2 = Math.abs(n(d.high) - n(p.close));
        const tr3 = Math.abs(n(d.low) - n(p.close));
        trs.push(Math.max(tr1, tr2, tr3));
      }
      const nBars = Math.min(14, trs.length);
      const atr = trs.slice(-nBars).reduce((s, v) => s + v, 0) / nBars;
      atrPct = atr / last;
    }
  } catch {
    // ignore ATR failure; leave null
  }
  // 3) Simple tech score: price change + intraday momentum + liquidity - penalties
  const pctChg = prevClose > 0 ? (last - prevClose) / prevClose : 0;
  const intraday = open > 0 ? (last - open) / open : 0;
  const liqScore = clamp01(avg1mVol / 200000); // saturate at your target liquidity
  const spreadPenalty = clamp01(spreadPct / 0.0035);
  const atrPenalty = atrPct != null ? clamp01(atrPct / 0.05) : 0.5;

  const techTotal =
    2.0 * pctChg +
    1.5 * intraday +
    0.5 * liqScore -
    0.6 * spreadPenalty -
    0.3 * atrPenalty;

  return {
    ...row,
    last,
    avg1mVol,
    spreadPct,
    atrPct,
    scores: { techTotal },
  };
}

/* ---------------------- utils ---------------------- */
function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
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
