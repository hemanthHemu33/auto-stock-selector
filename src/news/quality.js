// Map hostnames to quality weights [0..1]
const W = {
  "livemint.com": 0.85,
  "economictimes.indiatimes.com": 0.85,
  "moneycontrol.com": 0.85,
  "cnbctv18.com": 0.8,
  "timesofindia.indiatimes.com": 0.65,
  "reuters.com": 0.9,
  "bloomberg.com": 0.95,
  "nseindia.com": 1.0, // official filings
};

export function sourceWeight(host) {
  return W[host] ?? 0.6; // default
}

export function isOfficial(host) {
  return host === "nseindia.com";
}
