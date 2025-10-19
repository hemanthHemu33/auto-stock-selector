import { Router } from "express";
import {
  buildAndSaveShortlist,
  getTodayShortlist,
} from "../services/ShortlistService.js";

const r = Router();

/** POST /api/shortlist/build — explicit build endpoint (same as the shim) */
r.post("/build", async (req, res, next) => {
  try {
    const out = await buildAndSaveShortlist(req.body || {});
    res.json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
});

/** GET /api/shortlist/today — read saved shortlist for today */
r.get("/today", async (_req, res, next) => {
  try {
    const symbols = await getTodayShortlist();
    res.json({ ok: true, count: symbols.length, symbols });
  } catch (e) {
    next(e);
  }
});

export default r;
