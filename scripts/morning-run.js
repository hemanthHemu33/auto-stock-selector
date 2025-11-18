// scripts/morning-run.js
// Load .env (handled by: node -r dotenv/config ...)

import { connectMongo, closeMongo } from "../src/db/mongo.js";
import { initKiteAccessTokenFromMongo } from "../src/integrations/kite/tokenFromMongo.js";
import { runMorningWorkflow } from "../src/jobs/morningWorkflow.js";

async function main() {
  // 1) DB first
  await connectMongo();
  await initKiteAccessTokenFromMongo();

  // 2) Run the same morning workflow used by cron (sequential steps)
  const out = await runMorningWorkflow({ log: console });

  // 3) Log for CI/Render logs
  console.log(JSON.stringify(out, null, 2));
}

main()
  .then(() => closeMongo())
  .catch(async (err) => {
    console.error(err);
    try {
      await closeMongo();
    } catch {}
    process.exit(1);
  });
