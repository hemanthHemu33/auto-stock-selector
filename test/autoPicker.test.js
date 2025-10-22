import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runAutoPick,
  __setAutoPickerTestOverrides,
  __resetAutoPickerTestOverrides,
} from "../src/services/AutoPickerService.js";

test("runAutoPick ranks candidates using tech + news signals", async (t) => {
  const inserted = [];

  __setAutoPickerTestOverrides({
    isMarketOpenIST: () => false,
    async getCoreUniverse() {
      return [
        { symbol: "NSE:AAA", token: 1, name: "AAA" },
        { symbol: "NSE:BBB", token: 2, name: "BBB" },
        { symbol: "NSE:CCC", token: 3, name: "CCC" },
      ];
    },
    async getTodayShortlist() {
      return [];
    },
    async shortlistUniverse() {
      return [
        { symbol: "NSE:AAA", name: "AAA" },
        { symbol: "NSE:BBB", name: "BBB" },
        { symbol: "NSE:CCC", name: "CCC" },
      ];
    },
    async buildAndSaveShortlist() {
      return {};
    },
    async getTechScoresForSymbol(row) {
      const base = {
        "NSE:AAA": {
          last: 120,
          avg1mVol: 250000,
          atrPct: 0.03,
          spreadPct: 0.002,
          gapPct: 0.01,
          scores: { techTotal: 0.62, momScore: 0.58 },
        },
        "NSE:BBB": {
          last: 150,
          avg1mVol: 500000,
          atrPct: 0.025,
          spreadPct: 0.0015,
          gapPct: 0.02,
          scores: { techTotal: 0.6, momScore: 0.6 },
        },
        "NSE:CCC": {
          last: 40,
          avg1mVol: 50000,
          atrPct: 0.08,
          spreadPct: 0.009,
          gapPct: 0.01,
          scores: { techTotal: 0.55, momScore: 0.55 },
        },
      };
      return { symbol: row.symbol, name: row.name, ...base[row.symbol] };
    },
    async getNewsScoresForSymbols() {
      return new Map([
        ["NSE:AAA", { score: 0.4, hits: 1 }],
        ["NSE:BBB", { score: 0.7, hits: 3, reasons: ["fresh"] }],
      ]);
    },
    getDb() {
      return {
        collection() {
          return {
            insertOne(doc) {
              inserted.push(doc);
              return Promise.resolve();
            },
          };
        },
      };
    },
  });

  t.after(() => {
    __resetAutoPickerTestOverrides();
  });

  const result = await runAutoPick({ debug: true });

  assert.equal(result.top5.length, 2, "two candidates should survive gates");
  assert.equal(result.pick.symbol, "NSE:BBB", "best overall candidate should be BBB");
  assert.ok(result.debug);
  assert.equal(result.debug.rejected.length, 1, "one candidate rejected by gates");
  assert.equal(result.debug.rejected[0].symbol, "NSE:CCC");
  assert.equal(inserted.length, 1, "result persisted to Mongo once");
  assert.equal(inserted[0].top5.length, 2);
});
