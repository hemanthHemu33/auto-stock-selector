import {
  loadInstrumentDump,
  buildFNOBaseUniverse,
  filterByADV,
} from "../integrations/kite/universe.js";

// In-memory cache for the day. (Persist to Mongo later if you want history.)
let cache = {
  date: null, // "YYYY-MM-DD"
  core: [], // F&O base universe rows
  today: [], // today's candidate set (core + addons)
  meta: { coreCount: 0, addonCount: 0 },
};

/** Refresh the core F&O universe (call once each morning or via API) */
export async function refreshCoreUniverse({
  useADVFilter = false,
  minADV = 5e7,
} = {}) {
  const all = await loadInstrumentDump();
  const core = buildFNOBaseUniverse(all);
  const coreFiltered = useADVFilter
    ? await filterByADV(core, { minADV })
    : core;

  cache.date = new Date().toISOString().slice(0, 10);
  cache.core = coreFiltered;
  cache.today = []; // will be built later
  cache.meta = { coreCount: coreFiltered.length, addonCount: 0 };

  return { date: cache.date, count: coreFiltered.length };
}

/** Build today's candidate set (core + dynamic add-ons). For now, only core. */
export async function buildTodayUniverse({ addons = [] } = {}) {
  if (!cache.core?.length) {
    // lazy safety: build core if missing
    await refreshCoreUniverse();
  }

  // Merge core + addons (addons = [{symbol, token?, name?, tick_size?}, ...] or just symbol strings)
  const bySymbol = new Map(cache.core.map((row) => [row.symbol, row]));

  for (const a of addons) {
    if (typeof a === "string") {
      if (!bySymbol.has(a))
        bySymbol.set(a, {
          symbol: a,
          token: null,
          name: a.split(":")[1],
          tick_size: 0.05,
        });
    } else if (a?.symbol) {
      if (!bySymbol.has(a.symbol)) bySymbol.set(a.symbol, a);
    }
  }

  const final = [...bySymbol.values()];
  cache.today = final.slice(0, 300); // cap to ≤300
  cache.meta = {
    coreCount: cache.core.length,
    addonCount: final.length - cache.core.length,
  };

  return {
    date: cache.date,
    total: cache.today.length,
    core: cache.meta.coreCount,
    addons: cache.meta.addonCount,
  };
}

export function getCoreUniverse() {
  return { date: cache.date, count: cache.core.length, items: cache.core };
}
export function getTodayUniverse() {
  // if today isn't built, return core as a safe default
  const items = cache.today?.length ? cache.today : cache.core;
  return { date: cache.date, count: items.length, items };
}
