// src/utils/time.js
const TZ = "Asia/Kolkata";

/** Format a Date (or ISO/string) to an IST ISO-like string with offset */
export function toIST(d = new Date()) {
  const date = new Date(d);
  // Build YYYY-MM-DDTHH:mm:ss.sss+05:30 using locale parts for IST
  const pad = (n, w = 2) => String(n).padStart(w, "0");

  // Convert to IST by using locale with timeZone, then reconstruct
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});

  const yyyy = parts.year;
  const mm = parts.month;
  const dd = parts.day;
  const hh = parts.hour;
  const mi = parts.minute;
  const ss = parts.second;

  // IST is +05:30
  const ms = pad(date.getMilliseconds(), 3);
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}.${ms}+05:30`;
}

/** Return IST trading-day key as YYYY-MM-DD (e.g., "2025-10-28") */
export function toISTDateKey(d = new Date()) {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
}

/** If you need the TZ constant elsewhere */
export const IST_TZ = TZ;
