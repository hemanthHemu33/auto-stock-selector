// Formats any Date/ISO input as IST ISO-8601 with +05:30 offset.
// Example: 2025-10-09T14:05:12.123+05:30
const IST_TZ = "Asia/Kolkata";
const IST_OFFSET = "+05:30";

export function toIST(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(d)
    .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});

  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${ms}${IST_OFFSET}`;
}

export function nowISTISO() {
  return toIST(new Date());
}
