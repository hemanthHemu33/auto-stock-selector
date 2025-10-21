import { AutoPickerService } from "../services/AutoPickerService.js";
import {
  saveFinalSymbols,
  getFinalSymbolsToday,
} from "../services/FinalizeService.js";
export async function runPick(req, res, next) {
  try {
    const debug = req.query.debug === "1" || req.body?.debug === true;
    const out = await AutoPickerService.run({ debug });
    res.json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
}

export async function latestPick(_req, res, next) {
  try {
    const row = await AutoPickerService.getLatest();
    res.json({ ok: true, latest: row });
  } catch (e) {
    next(e);
  }
}

export async function latestTop(_req, res, next) {
  try {
    const row = await AutoPickerService.getLatest();
    if (!row) return res.status(404).json({ ok: false, error: "no_pick" });
    res.json({ ok: true, pick: row.pick ?? null, top5: row.top5 ?? [] });
  } catch (e) {
    next(e);
  }
}
/**
 * Finalize today's symbols:
 * - If body.symbols provided, use those (must be ["NSE:..."]).
 * - Else, take from latest auto_picks: [pick + top5] up to ?limit (default 5).
 */
export async function finalizeToday(req, res, next) {
  try {
    const limit = Math.max(1, Math.min(20, Number(req.query.limit || 5)));
    let symbols = [];

    if (Array.isArray(req.body?.symbols) && req.body.symbols.length) {
      symbols = req.body.symbols;
    } else {
      const latest = await AutoPickerService.getLatest();
      if (!latest)
        return res.status(400).json({ ok: false, error: "no_latest_pick" });

      // Build a list: pick (if any) + top5 symbols
      const list = [];
      if (latest.pick?.symbol) list.push(latest.pick.symbol);
      for (const r of latest.top5 || []) {
        if (r?.symbol) list.push(r.symbol);
      }
      symbols = list.slice(0, limit);
    }

    const doc = await saveFinalSymbols({ symbols, source: "auto-pick" });
    res.json({ ok: true, ...doc });
  } catch (e) {
    next(e);
  }
}

/** Read today's finalized doc (if any) */
export async function getFinalToday(_req, res, next) {
  try {
    const row = await getFinalSymbolsToday();
    if (!row)
      return res.status(404).json({ ok: false, error: "no_final_for_today" });
    res.json({ ok: true, ...row });
  } catch (e) {
    next(e);
  }
}
