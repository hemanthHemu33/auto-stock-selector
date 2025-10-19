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
export async function createApp() {
  await connectMongo();

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(cors());
  app.use(helmet());
  app.use(morgan("tiny"));

  app.use("/healthz", healthRoutes);

  // F&O PICK APIS
  app.use("/api/auto-pick", autoPickRoutes);
  app.use("/api/universe", universeRoutes);
  app.use("/api/pick", pickRoutes);
  app.use("/api/top", autoPickRoutes);

  // NEWS APIS
  app.use("/api/news", newsRoutes);
  app.use("/api/shortlist", shortlistRoutes);

  // Safe global error handler
  app.use((err, req, res, _next) => {
    const msg =
      err && typeof err.message === "string" ? err.message : "internal_error";
    const status = Number(err?.statusCode || err?.status || 500);
    res.status(status).json({ error: "internal_error", message: msg });
  });

  return app;
}
