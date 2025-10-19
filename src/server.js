// src/server.js
import "./config/env.js";
import express from "express";
import { connectMongo } from "./db/mongo.js";
import { ensureIndexes } from "./db/indexes.js";

await connectMongo(); // one shared connection for the app
await ensureIndexes();

import { createApp } from "./app.js";
import { initKiteAccessTokenFromMongo } from "./integrations/kite/tokenFromMongo.js";
import kiteRoutes from "./routes/kite.routes.js";

await initKiteAccessTokenFromMongo(); // <-- pull today's token from Mongo

import "./jobs/schedule.js";

const PORT = process.env.PORT || 8000;
const app = await createApp();

app.use("/api/kite", kiteRoutes);
app.listen(PORT, () => console.log(`[auto-pick] listening on ${PORT}`));
