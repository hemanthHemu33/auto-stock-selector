import { Router } from "express";
import { health } from "../controllers/HealthController.js";
const router = Router();
router.get("/", health);
export default router;
