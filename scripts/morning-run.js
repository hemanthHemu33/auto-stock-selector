// scripts/morning-run.js
// Load .env (handled by: node -r dotenv/config ...)

import { connectMongo, closeMongo } from "../src/db/mongo.js";
import { AutoPickerService } from "../src/services/AutoPickerService.js";
import { publishFinalList } from "../src/services/PublishService.js";
import { toISTDateKey } from "../src/utils/time.js";
import { isTradingDayIST } from "../src/utils/holidays.js";

async function main() {
  // 1) DB first
  await connectMongo();

  // 2) Skip if holiday
  const todayKey = toISTDateKey();
  if (typeof isTradingDayIST === "function" && !(await isTradingDayIST())) {
    console.log(
      JSON.stringify({ ok: false, reason: "holiday", day: todayKey }, null, 2)
    );
    return;
  }

  // 3) Ensure we have a pick for today; if not, create one
  const latest = await AutoPickerService.getLatest();
  const hasToday =
    latest &&
    typeof latest.ts === "string" &&
    latest.ts.slice(0, 10) === todayKey &&
    (latest.filteredSize ?? 0) > 0;

  if (!hasToday) {
    await AutoPickerService.run({ debug: false });
  }

  // 4) Publish final names to top_stock_symbols
  const out = await publishFinalList({ source: "preopen", force: true });

  // 5) Log for CI/Render logs
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
