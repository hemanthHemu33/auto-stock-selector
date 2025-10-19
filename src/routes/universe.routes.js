// src/routes/universe.routes.js
import { Router } from "express";
import {
  loadInstrumentDump,
  buildFNOBaseUniverseFromDump,
  saveCoreUniverse,
  getCoreUniverse,
  filterByADV,
} from "../integrations/kite/universe.js";
import {
  buildAndSaveShortlist,
  getTodayShortlist,
} from "../services/ShortlistService.js";

const r = Router();

/**
 * POST /api/universe/refresh-core
 * Body (optional): { "useADVFilter": true, "minADV": 50000000 }
 * Builds today’s F&O core and persists it (one doc per IST day).
 */
r.post("/refresh-core", async (req, res, next) => {
  try {
    const { useADVFilter = false, minADV = 5e7 } = req.body || {};

    const dump = await loadInstrumentDump(); // { nse, nfo }
    let core = buildFNOBaseUniverseFromDump(dump); // ~170–210 names

    if (useADVFilter) core = await filterByADV(core, { minADV });

    await saveCoreUniverse(core);
    res.json({ ok: true, count: core.length });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/universe/core
 * Returns today’s core universe (reads DB or computes if missing)
 */
r.get("/core", async (_req, res, next) => {
  try {
    const items = await getCoreUniverse();
    res.json({
      ok: true,
      count: items.length,
      items: items.map((x) => ({ symbol: x.symbol, name: x.name })),
    });
  } catch (e) {
    next(e);
  }
});

/**
 * 🔧 Shim so your existing cron keeps working:
 * POST /api/universe/build-today
 * Builds and persists today's shortlist (top_stock_symbols).
 */
r.post("/build-today", async (req, res, next) => {
  try {
    const out = await buildAndSaveShortlist(req.body || {});
    res.json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/universe/today
 * Convenience: return today's saved shortlist with names attached.
 */
r.get("/today", async (_req, res, next) => {
  try {
    const symbols = await getTodayShortlist(); // ["NSE:HAL", ...]
    const core = await getCoreUniverse();
    const nameBySym = new Map(core.map((x) => [x.symbol, x.name]));
    res.json({
      ok: true,
      count: symbols.length,
      items: symbols.map((s) => ({ symbol: s, name: nameBySym.get(s) || "" })),
    });
  } catch (e) {
    next(e);
  }
});

export default r;
