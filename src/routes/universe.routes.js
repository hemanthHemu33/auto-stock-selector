// src\routes\universe.routes.js

import { Router } from "express";
import {
  refreshCore,
  buildToday,
  getCoreAPI,
  getTodayAPI,
} from "../controllers/UniverseController.js";
const router = Router();

// POSTs (mutating)
router.post("/refresh-core", refreshCore); // builds F&O universe, optional ADV filter
router.post("/build-today", buildToday); // builds today's candidate set (core + addons)

// GETs (read-only)
router.get("/core", getCoreAPI); // returns current core universe
router.get("/today", getTodayAPI); // returns today's candidate set (or core if not built yet)

export default router;
