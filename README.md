# auto-pick-service (JavaScript, ESM)

A lightweight MVC microservice that picks **one best stock** for the session using:
- Market data from **Zerodha Kite Connect**
- News/announcements ingestion (RSS/custom) + **LLM sentiment/catalyst grading**
- A weighted combine of sentiment, catalyst, momentum, liquidity, and fundamentals

It exposes:
- `POST /api/auto-pick/run`  — trigger a run (`{ "runType": "preopen"|"midday"|"eod" }`)
- `GET  /api/auto-pick/latest` — fetch most recent pick
- `GET  /healthz` — health check

## Quick start

1) `cp .env.example .env` and fill values (Mongo, OpenAI key, Zerodha access token)
2) `npm install`
3) `npm start`
4) Hit `POST http://localhost:8082/api/auto-pick/run` (body: `{ "runType": "preopen" }`) then `GET /api/auto-pick/latest`

> **Note:** News ingestors are stubbed — service still works by falling back to technical factors and a default LLM aggregate (no-news path). Wire RSS later.

## Wire to your Scanner

In your scanner, poll every 2 minutes (only in auto-mode):

```js
import fetch from "node-fetch";
import { setStockSymbol } from "./kite.js";

async function syncAutoPick() {
  const res = await fetch("http://YOUR_SERVICE_HOST:8082/api/auto-pick/latest");
  const pick = await res.json();
  if (pick?.symbol) await setStockSymbol(pick.symbol);
}
setInterval(syncAutoPick, 120000);
syncAutoPick();
```

## Folder layout

- `src/config/selection.js` — watchlist, weights, filters, schedules
- `src/services/*` — NewsIngestor, Sentiment (OpenAI), TechFactor, Combine, AutoPicker
- `src/integrations/kite/*` — Zerodha client & helpers
- `src/integrations/openai/*` — OpenAI client
- `src/db/models/*` — Mongoose models
- `src/routes/*` + `src/controllers/*` — REST endpoints
- `src/jobs/schedule.js` — cron schedules (IST): 08:35, 09:14, 12:30, 14:00

## Roadmap

- Implement RSS: Google News per symbol, NSE Announcements (respect ToS)
- Replace placeholder tech metrics with real Zerodha-derived values
- Add tie-breakers (prefer lower ATR, better liquidity)
- Optional: Batch LLM grading, embeddings for dedupe, signed webhooks to scanner
