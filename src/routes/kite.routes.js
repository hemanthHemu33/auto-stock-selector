// src/routes/kite.routes.js
import { Router } from "express";
import { getKite } from "../integrations/kite/kiteClient.js";

const r = Router();

// GET /api/kite/ltp?symbol=ADANIPOWER
r.get("/ltp", async (req, res) => {
  try {
    const sym = (req.query.symbol || "").toUpperCase();
    if (!sym)
      return res.status(400).json({ ok: false, error: "symbol required" });
    const kite = getKite();
    const map = await kite.getLTP([`NSE:${sym}`]);
    res.json({ ok: true, data: map[`NSE:${sym}`] || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/kite/quote?symbol=ADANIPOWER
r.get("/quote", async (req, res) => {
  try {
    const sym = (req.query.symbol || "").toUpperCase();
    const kite = getKite();
    const map = await kite.getQuote([`NSE:${sym}`]);
    res.json({ ok: true, data: map[`NSE:${sym}`] || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default r;
