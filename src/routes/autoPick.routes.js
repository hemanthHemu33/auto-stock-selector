import { Router } from "express";
import {
  runPick,
  latestPick,
  latestTop,
  finalizeToday,
  getFinalToday,
} from "../controllers/AutoPickController.js";

const r = Router();
r.post("/run", runPick);
r.get("/run", runPick); // optional GET alias
r.get("/latest", latestPick);
r.get("/top", latestTop);
// Finalize → DB: top_stock_symbols (strings like "NSE:RELIANCE")
r.post("/finalize", finalizeToday); // body.symbols? otherwise from latest pick/top5
r.get("/final", getFinalToday); // read today's finalized doc
export default r;
