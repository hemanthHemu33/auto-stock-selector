import { AutoPickerService } from "../services/AutoPickerService.js";
const service = new AutoPickerService();

export async function runNow(req, res, next) {
  try {
    const runType = req.body?.runType || "preopen";
    const doc = await service.run(runType);
    res.json(doc);
  } catch (e) { next(e); }
}

export async function latest(req, res, next) {
  try {
    const doc = await service.latest();
    res.json(doc ?? { message: "no-pick-yet" });
  } catch (e) { next(e); }
}
