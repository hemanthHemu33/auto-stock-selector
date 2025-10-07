import { runAutoPick, getLatestPick } from "../services/AutoPickerService.js";

export async function runPick(req, res, next) {
  try {
    const out = await runAutoPick();
    res.json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
}

export async function latestPick(_req, res, next) {
  try {
    const row = await getLatestPick();
    res.json({ ok: true, latest: row });
  } catch (e) {
    next(e);
  }
}
