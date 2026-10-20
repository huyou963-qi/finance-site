import assert from "node:assert/strict";
import { before, test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import type { KlineFetchRequest } from "./klineProviderTypes";

const rows = Array.from({ length: 45 }, (_, i) => ({ instrumentId: "dgs2",
  obsDate: new Date(Date.UTC(2025, 0, i + 1)), value: i === 0 ? 0 : 4 + i / 100 }));
(globalThis as unknown as { prisma: PrismaClient }).prisma = {
  instrument: { findMany: async () => [{ id: "dgs2", fredSeriesId: "DGS2" }] },
  macroObservation: { findMany: async () => [...rows].reverse() },
} as unknown as PrismaClient;
let provider: typeof import("./macroYieldKlineProvider").macroYieldKlineProvider;
before(async () => { provider = (await import("./macroYieldKlineProvider")).macroYieldKlineProvider; });
const request: KlineFetchRequest = { symbol: "TVC:US02Y", interval: "1d", limit: 20, adjustment: "forward", window: {} };

test("US2Y reuses canonical FRED data as a labelled line without volume", async () => {
  const result = await provider.fetch(request);
  assert.equal(result.symbol, "US2Y");
  assert.equal(result.source, "fred");
  assert.equal(result.observationOnly, true);
  assert.equal(result.volumeAvailable, false);
  assert.equal(result.candles.length, 20);
  assert.equal(result.candles.at(-1)?.close, 4.44);
  assert.equal(result.hasMoreOlder, true);
  assert.match(result.attribution ?? "", /DGS2.*官方日度观测/);
});

test("yield history paging is exclusive, range is inclusive and zero observations are retained", async () => {
  const before = rows[20].obsDate.getTime() / 1000;
  const page = await provider.fetch({ ...request, window: { beforeTimeSec: before } });
  assert.equal(page.hasMoreOlder, false);
  assert.ok(page.candles.every(bar => Number(bar.time) < before));
  assert.equal(page.candles[0]?.close, 0);
  const range = await provider.fetch({ ...request, window: { fromTimeSec: rows[3].obsDate.getTime() / 1000, toTimeSec: before } });
  assert.equal(range.candles.length, 18);
  assert.equal(range.candles.at(-1)?.time, before);
});

test("weekly observations retain the last published date and intraday requests fail explicitly", async () => {
  const result = await provider.fetch({ ...request, interval: "1w" });
  assert.ok(result.candles.length < rows.length);
  assert.equal(result.candles.at(-1)?.time, rows.at(-1)!.obsDate.getTime() / 1000);
  assert.match(result.attribution ?? "", /每周最后观测值/);
  const toTimeSec = Date.UTC(2025, 0, 8) / 1000;
  const bounded = await provider.fetch({ ...request, interval: "1w", window: { fromTimeSec: Date.UTC(2025, 0, 6) / 1000, toTimeSec } });
  assert.equal(bounded.candles.at(-1)?.time, toTimeSec);
  assert.equal(bounded.candles.at(-1)?.close, 4.07);
  await assert.rejects(provider.fetch({ ...request, interval: "1h" }), /不支持盘中周期/);
});
