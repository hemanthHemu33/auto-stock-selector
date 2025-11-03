import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import "./config/env.js";
import { connectMongo } from "./db/mongo.js";
import autoPickRoutes from "./routes/autoPick.routes.js";
import healthRoutes from "./routes/health.routes.js";
import universeRoutes from "./routes/universe.routes.js";
import pickRoutes from "./routes/pick.routes.js";
import newsRoutes from "./routes/news.routes.js";
import shortlistRoutes from "./routes/shortlist.routes.js";
import { logger } from "./utils/logger.js";
export async function createApp() {
  logger.info("[app] Ensuring Mongo connection before app setup...");
  await connectMongo();
  logger.info("[app] Mongo connection ready");

  logger.info("[app] Creating Express application instance");
  const app = express();
  logger.info("[app] Registering JSON body parser middleware");
  app.use(express.json({ limit: "1mb" }));
  logger.info("[app] Registering CORS middleware");
  app.use(cors());
  logger.info("[app] Registering Helmet middleware");
  app.use(helmet());
  logger.info("[app] Registering Morgan request logger");
  app.use(morgan("tiny"));

  logger.info("[app] Attaching health routes at /healthz");
  app.use("/healthz", healthRoutes);

  // F&O PICK APIS
  logger.info("[app] Attaching auto-pick routes at /api/auto-pick");
  app.use("/api/auto-pick", autoPickRoutes);
  logger.info("[app] Attaching universe routes at /api/universe");
  app.use("/api/universe", universeRoutes);
  logger.info("[app] Attaching pick routes at /api/pick");
  app.use("/api/pick", pickRoutes);
  logger.info("[app] Attaching top routes at /api/top");
  app.use("/api/top", autoPickRoutes);

  // NEWS APIS
  logger.info("[app] Attaching news routes at /api/news");
  app.use("/api/news", newsRoutes);
  logger.info("[app] Attaching shortlist routes at /api/shortlist");
  app.use("/api/shortlist", shortlistRoutes);

  // Safe global error handler
  app.use((err, req, res, _next) => {
    logger.error("[app] Global error handler caught an error", err);
    const msg =
      err && typeof err.message === "string" ? err.message : "internal_error";
    const status = Number(err?.statusCode || err?.status || 500);
    res.status(status).json({ error: "internal_error", message: msg });
  });

  logger.info("[app] Application setup complete");
  return app;
}
