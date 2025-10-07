import { Router } from "express";
import { runNow, latest } from "../controllers/AutoPickController.js";
const router = Router();

router.post("/run", runNow);
router.get("/latest", latest);

export default router;
