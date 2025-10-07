import { AutoPickerService } from "../services/AutoPickerService.js";

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
