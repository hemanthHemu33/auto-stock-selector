import cron from "node-cron";
const tz = "Asia/Kolkata";

async function hit(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 08:00 IST: refresh core
cron.schedule(
  "0 8 * * 1-5",
  () =>
    hit("http://localhost:8000/api/universe/refresh-core", {
      useADVFilter: false,
      minADV: 50000000,
    }),
  { timezone: tz }
);

// 08:35 IST: build today’s candidate set (you can pass add-ons later)
cron.schedule(
  "35 8 * * 1-5",
  () =>
    hit("http://localhost:8000/api/universe/build-today", {
      addons: [],
    }),
  { timezone: tz }
);
