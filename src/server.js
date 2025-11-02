// src/server.js
import "./config/env.js";
import { connectMongo } from "./db/mongo.js";
import { ensureIndexes } from "./db/indexes.js";
import autoPickRoutes from "./routes/autoPick.routes.js";
// import "./news/routes.js"; // if you have it
import "./jobs/scheduler.js";
import { createApp } from "./app.js";
import { initKiteAccessTokenFromMongo } from "./integrations/kite/tokenFromMongo.js";
import kiteRoutes from "./routes/kite.routes.js";
// import "./jobs/scheduler.js";
import { getCoreUniverse } from "./integrations/kite/universe.js";
import { logger } from "./utils/logger.js";

logger.info("[server] Boot sequence started");

logger.info("[server] Connecting to MongoDB (bootstrap connection)...");
await connectMongo(); // one shared connection for the app
logger.info("[server] MongoDB bootstrap connection established");

logger.info("[server] Ensuring MongoDB indexes...");
await ensureIndexes();
logger.info("[server] MongoDB indexes ensured");

logger.info("[server] Loading Kite access token from MongoDB...");
try {
  await initKiteAccessTokenFromMongo(); // <-- pull today's token from Mongo
  logger.info("[server] Kite access token loaded successfully");
} catch (error) {
  logger.warn("[server] Failed to load Kite access token", error);
}

const PORT = process.env.PORT || 8000;
logger.info(`[server] Configured to listen on port ${PORT}`);

logger.info("[server] Creating application instance...");
const app = await createApp();
logger.info("[server] Application instance created");

app.use("/api/kite", kiteRoutes);
app.use("/api/pick", autoPickRoutes);
// app.listen(PORT, () => console.log(`[auto-pick] listening on ${PORT}`));
(async () => {
  logger.info("[server] Establishing dedicated Mongo connection for listener...");
  await connectMongo();
  logger.info("[server] Dedicated Mongo connection ready");
  // (If you use Kite token loader, call it here)
  app.listen(PORT, () => {
    logger.info(`[server] Listening on port ${PORT}`);
    getCoreUniverse()
      .then(() => {
        logger.info("[server] Core universe prefetch completed");
      })
      .catch((error) => {
        logger.warn("[server] Core universe prefetch failed", error);
      });
  });
})();
