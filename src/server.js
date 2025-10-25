// src/server.js
import "./config/env.js";
import express from "express";
import { connectMongo } from "./db/mongo.js";
import { ensureIndexes } from "./db/indexes.js";
import autoPickRoutes from "./routes/autoPick.routes.js";
// import "./news/routes.js"; // if you have it
import "./jobs/scheduler.js";
import { createApp } from "./app.js";
import { initKiteAccessTokenFromMongo } from "./integrations/kite/tokenFromMongo.js";
import kiteRoutes from "./routes/kite.routes.js";
import "./jobs/schedule.js";

await connectMongo(); // one shared connection for the app
await ensureIndexes();
await initKiteAccessTokenFromMongo(); // <-- pull today's token from Mongo

const PORT = process.env.PORT || 8000;
const app = await createApp();

app.use("/api/kite", kiteRoutes);
app.use("/api/pick", autoPickRoutes);
app.listen(PORT, () => console.log(`[auto-pick] listening on ${PORT}`));
