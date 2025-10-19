// src/news/rss.js
import Parser from "rss-parser";
import sanitizeHtml from "sanitize-html";

const parser = new Parser();

function withTimeout(promise, ms, label = "op") {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timeout after ${ms}ms`)),
      ms
    );
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

async function fetchWithTimeout(url, { headers = {}, timeoutMs = 7000 } = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { headers, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function fetchRSSFeed(url) {
  // Try fetching raw XML with a browser-like UA (7s timeout), then parse
  try {
    const res = await fetchWithTimeout(url, {
      timeoutMs: 7000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      },
    });
    if (res.ok) {
      const xml = await withTimeout(res.text(), 3000, "read rss body");
      const feed = await withTimeout(
        parser.parseString(xml),
        3000,
        "parse rss string"
      );
      return (feed.items || []).map(normalizeItem);
    }
  } catch (_) {
    // fallthrough to parseURL
  }

  // Fallback: parser hits the URL itself (7s timeout)
  try {
    const feed = await withTimeout(
      parser.parseURL(url),
      7000,
      "parser.parseURL"
    );
    return (feed.items || []).map(normalizeItem);
  } catch {
    return [];
  }
}

function normalizeItem(it) {
  const title = cleanText(it.title || "");
  const description = cleanText(
    it.contentSnippet || it.content || it.summary || ""
  );
  const url = it.link || it.guid || "";
  const ts = it.isoDate
    ? new Date(it.isoDate)
    : it.pubDate
    ? new Date(it.pubDate)
    : new Date();
  return {
    title,
    description,
    url,
    ts: ts.toISOString(),
    source: hostname(url),
  };
}

function cleanText(t) {
  const s = sanitizeHtml(t, { allowedTags: [], allowedAttributes: {} }) || "";
  return s.replace(/\s+/g, " ").trim();
}
function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
