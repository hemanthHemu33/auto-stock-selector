import {
  refreshCoreUniverse,
  buildTodayUniverse,
  getCoreUniverse,
  getTodayUniverse,
} from "../services/UniverseManager.js";

export async function refreshCore(req, res, next) {
  try {
    const useADVFilter = req.body?.useADVFilter ?? false;
    const minADV = req.body?.minADV ?? 5e7; // default ₹5 crore
    const out = await refreshCoreUniverse({ useADVFilter, minADV });
    res.json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
}

export async function buildToday(req, res, next) {
  try {
    // Optionally accept add-ons from caller (array of symbols or rows)
    const addons = Array.isArray(req.body?.addons) ? req.body.addons : [];
    const out = await buildTodayUniverse({ addons });
    res.json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
}

export async function getCoreAPI(_req, res, next) {
  try {
    res.json(getCoreUniverse());
  } catch (e) {
    next(e);
  }
}

export async function getTodayAPI(_req, res, next) {
  try {
    res.json(getTodayUniverse());
  } catch (e) {
    next(e);
  }
}
