// src/worker.js
import "./integrations/config/env.js"; // if you have a central env loader
import { connectMongo } from "./db/mongo.js";
import "./jobs/autoRunner.js"; // just importing sets up cron
import { bootOnce } from "./jobs/autoRunner.js";

const start = async () => {
  await connectMongo();
  await bootOnce();
  console.log("[worker] auto-runner is up");
  // keep process alive
};

start().catch((e) => {
  console.error("[worker] failed:", e?.message || e);
  process.exit(1);
});
