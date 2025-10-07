import { Router } from "express";
import {
  runPick,
  latestPick,
  latestTop,
} from "../controllers/AutoPickController.js";

const r = Router();
r.post("/run", runPick);
r.get("/run", runPick); // optional GET alias
r.get("/latest", latestPick);
r.get("/top", latestTop); // <-- this one
export default r;
