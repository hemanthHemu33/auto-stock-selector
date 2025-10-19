function timeInKolkata(d = new Date()) {
  const s = d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  return new Date(s);
}

export function isTradingDayIST(d = new Date()) {
  const t = timeInKolkata(d);
  const dow = t.getDay(); // 0 Sun - 6 Sat
  return dow >= 1 && dow <= 5;
}

export function isMarketOpenIST(d = new Date()) {
  const t = timeInKolkata(d);
  if (!isTradingDayIST(t)) return false;
  const mins = t.getHours() * 60 + t.getMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30; // 09:15–15:30
}
