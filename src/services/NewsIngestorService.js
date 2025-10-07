import crypto from "crypto";
import NewsArticle from "../db/models/NewsArticle.js";

/** TODO: Implement real RSS fetchers (Google News per symbol, NSE announcements) */
async function fetchGoogleNewsLike(symbols, sinceHours = 48) { return []; }
async function fetchNseAnnouncements(symbols, sinceHours = 48) { return []; }

export class NewsIngestorService {
  async ingestForSymbols(symbols, sinceHours = 48) {
    const lists = await Promise.all([
      fetchGoogleNewsLike(symbols, sinceHours),
      fetchNseAnnouncements(symbols, sinceHours)
    ]);
    const items = lists.flat();
    for (const i of items) {
      const hash = crypto.createHash("sha1").update((i.url || i.headline || "") + (i.symbol || "")).digest("hex");
      await NewsArticle.updateOne({ hash }, { ...i, hash }, { upsert: true });
    }
    return items.length;
  }

  async latestForSymbol(symbol, sinceHours = 36) {
    const since = new Date(Date.now() - sinceHours * 3600 * 1000);
    return await NewsArticle.find({ symbol, ts: { $gte: since } }).sort({ ts: -1 }).limit(20);
  }
}
