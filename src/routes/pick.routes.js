import { Router } from "express";
import { runPick, latestPick } from "../controllers/PickController.js";
const r = Router();

r.post("/run", runPick); // POST /api/pick/run => triggers a pick now
r.get("/latest", latestPick); // GET /api/pick/latest => returns the latest pick
r.get("/run", runPick);
r.get("/top", latestPick); // optional alias
export default r;
