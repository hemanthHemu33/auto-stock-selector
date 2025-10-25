// src/utils/holidays.js
// Minimal helper: mark weekends & known NSE holidays as non-trading days.
// 👉 Update this list yearly (keep it lean; no scraping needed).

const IST_TZ = "Asia/Kolkata";

// YYYY-MM-DD (IST)
const NSE_HOLIDAYS_2025 = new Set([
  "2025-01-01", // New Year (example)
  "2025-01-14", // Makar Sankranti (example)
  "2025-01-26", // Republic Day
  "2025-03-14", // Holi (example)
  "2025-03-31", // Year end bank holiday (if exchange holiday)
  "2025-04-18", // Good Friday
  "2025-05-01", // Maharashtra Day
  "2025-08-15", // Independence Day
  "2025-10-02", // Gandhi Jayanti
  "2025-10-24", // Diwali (example)
  "2025-12-25", // Christmas
  // Add/adjust based on the official NSE circular
]);

export function toISTDateKey(d = new Date()) {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: IST_TZ }); // YYYY-MM-DD
}
export function isWeekendIST(d = new Date()) {
  const s = new Date(d).toLocaleString("en-US", {
    timeZone: IST_TZ,
    weekday: "short",
  });
  return s === "Sat" || s === "Sun";
}
export function isTradingHolidayIST(d = new Date()) {
  return NSE_HOLIDAYS_2025.has(toISTDateKey(d));
}
export function isTradingDayIST(d = new Date()) {
  return !isWeekendIST(d) && !isTradingHolidayIST(d);
}
