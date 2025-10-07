// src/controllers/UniverseController.js
// Works with the UniverseManager we added earlier.
// If you didn't add it, see the inline fallback that uses getCoreUniverse() directly.

import {
  refreshCoreUniverse,
  buildTodayUniverse,
  getCoreUniverse as getCoreFromMgr,
  getTodayUniverse as getTodayFromMgr,
} from "../services/UniverseManager.js";

// OPTIONAL fallback if you didn't keep UniverseManager.js:
// import { getCoreUniverse as getCoreDirect } from "../integrations/kite/universe.js";

function namesOnly(items) {
  return items.map((x) => ({
    symbol: x.symbol, // e.g. "NSE:ADANIPOWER"
    name: x.name || (x.symbol?.split(":")[1] ?? null),
  }));
}

/** POST /api/universe/refresh-core
 *  body: { useADVFilter?: boolean, minADV?: number }
 */
export async function refreshCore(req, res, next) {
  try {
    const useADVFilter = req.body?.useADVFilter ?? false;
    const minADV = req.body?.minADV ?? 5e7; // ₹5 crore default
    const out = await refreshCoreUniverse({ useADVFilter, minADV });
    res.json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
}

/** POST /api/universe/build-today
 *  body: { addons?: Array<string|{symbol:string,...}> }
 */
export async function buildToday(req, res, next) {
  try {
    const addons = Array.isArray(req.body?.addons) ? req.body.addons : [];
    const out = await buildTodayUniverse({ addons });
    res.json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
}

/** GET /api/universe/core?names=1
 *  returns either the full objects, or a names-only compact list if names=1
 */
export async function getCoreAPI(req, res, next) {
  try {
    // Preferred: use UniverseManager cache
    const core = getCoreFromMgr();
    const items = core?.items ?? [];

    // Fallback if you removed UniverseManager:
    // const items = await getCoreDirect();

    if (req.query.names === "1") {
      return res.json({
        ok: true,
        date: core?.date ?? null,
        count: items.length,
        items: namesOnly(items),
      });
    }
    // full payload (includes symbol, token, name, tick_size)
    res.json({
      ok: true,
      date: core?.date ?? null,
      count: items.length,
      items,
    });
  } catch (e) {
    next(e);
  }
}

/** GET /api/universe/today?names=1
 *  returns today's candidate set (or core if not built yet)
 */
export async function getTodayAPI(req, res, next) {
  try {
    const today = getTodayFromMgr();
    const items = today?.items ?? [];

    if (req.query.names === "1") {
      return res.json({
        ok: true,
        date: today?.date ?? null,
        count: items.length,
        items: namesOnly(items),
      });
    }
    res.json({
      ok: true,
      date: today?.date ?? null,
      count: items.length,
      items,
    });
  } catch (e) {
    next(e);
  }
}
