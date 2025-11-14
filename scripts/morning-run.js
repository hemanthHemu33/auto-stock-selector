// scripts/morning-run.js
// Load .env (handled by: node -r dotenv/config ...)

import { connectMongo, closeMongo } from "../src/db/mongo.js";
import { AutoPickerService, isPickForDate } from "../src/services/AutoPickerService.js";
import { publishFinalList } from "../src/services/PublishService.js";
import { publishSymbolsToScanner } from "../src/services/StockSymbolsPublisher.js";
import { toISTDateKey } from "../src/utils/time.js";
import { isTradingDayIST } from "../src/utils/holidays.js";
import { initKiteAccessTokenFromMongo } from "../src/integrations/kite/tokenFromMongo.js";

async function main() {
  // 1) DB first
  await connectMongo();
  await initKiteAccessTokenFromMongo();

  // 2) Skip if holiday
  const todayKey = toISTDateKey();
  if (typeof isTradingDayIST === "function" && !(await isTradingDayIST())) {
    const holidayOut = {
      ok: false,
      reason: "holiday",
      day: todayKey,
    };
    console.log(JSON.stringify(holidayOut, null, 2));
    return;
  }

  // 3) Ensure we have a pick for today; if not, create one
  const latest = await AutoPickerService.getLatest();
  const hasToday =
    isPickForDate(latest, todayKey) && (latest?.filteredSize ?? 0) > 0;

  if (!hasToday) {
    await AutoPickerService.run({ debug: false });
  }

  // 4) Publish final names to top_stock_symbols (your existing behavior)
  const out = await publishFinalList({ source: "preopen", force: true });

  // 5) ALSO push the same symbols into stock_symbols
  //    so the live scanner (which reads stock_symbols) will use them.
  if (out && Array.isArray(out.symbols) && out.symbols.length > 0) {
    console.log("[morning-run] pushing symbols into stock_symbols ...");
    await publishSymbolsToScanner(out.symbols);
    console.log("[morning-run] stock_symbols update complete.");
  } else {
    console.warn(
      "[morning-run] No symbols found in publishFinalList() output, skipping stock_symbols update."
    );
  }

  // 6) Log for CI/Render logs (kept exactly like you were doing)
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
