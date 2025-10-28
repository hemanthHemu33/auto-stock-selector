// Minimal curated sources. Add/remove as you like.
// Tip: prefer headlines/briefs feeds; avoid paywalled full content.
export const RSS_SOURCES = [
  // LiveMint markets
  "https://www.livemint.com/rss/markets",
  // Economic Times - markets (if they expose RSS)
  "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
  // Moneycontrol news (broad)
  "https://www.moneycontrol.com/rss/latestnews.xml",
  // NSE corporate announcements (there are JSON endpoints; use RSS-like polling if available)
  // Add sector blogs, exchanges, or your own webhook source here.

  "https://www.livemint.com/rss/companies",
  "https://www.livemint.com/rss/opinion",
  "https://www.cnbctv18.com/commonfeeds/v1/cne/rss/market.xml",
  "https://www.cnbctv18.com/commonfeeds/v1/cne/rss/latest.xml",
  "https://www.cnbctv18.com/commonfeeds/v1/cne/rss/business.xml",
  "https://www.cnbctv18.com/commonfeeds/v1/cne/rss/world.xml",
  "https://timesofindia.indiatimes.com/rssfeeds/1898055.cms",

  // Regulators / exchanges (highest-signal)
  "https://www.sebi.gov.in/sebirss.xml", // SEBI consolidated RSS (press/circulars/orders)
  // (NSE has an RSS hub page listing multiple feeds, but it’s HTML. If/when NSE exposes stable XML feed URLs, add them.)

  // LiveMint (use the canonical *RSS* endpoints)
  "https://www.livemint.com/rss/marketsRSS", // Markets
  "https://www.livemint.com/rss/companiesRSS", // Companies
  "https://www.livemint.com/rss/opinionRSS", // Opinion

  // Business Standard (section RSS)
  "https://www.business-standard.com/rss/markets-106.rss", // Markets
  "https://www.business-standard.com/rss/companies-101.rss", // Companies

  // Indian Express (WordPress feed → XML)
  "https://indianexpress.com/section/business/feed/", // Business feed (XML)
];
