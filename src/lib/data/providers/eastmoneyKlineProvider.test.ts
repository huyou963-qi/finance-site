import assert from "node:assert/strict";
import { test } from "node:test";
import { eastmoneySymbolFromSuggestion, resolveEastmoneyInstrument } from "../eastmoneySymbols";
import { normalizeTickerSymbol } from "../tickerSymbolNormalize";
import { aggregateEastmoneyFourHours, eastmoneyKlineProvider, parseEastmoneyBars } from "./eastmoneyKlineProvider";

test("routes A/B/Beijing/HK/gold without colliding with US tickers", () => {
  for (const [raw, symbol, secid, currency] of [
    ["600519", "600519.SH", "1.600519", "CNY"],
    ["SZ000001", "000001.SZ", "0.000001", "CNY"],
    ["000001.SH", "000001.SH", "1.000001", "CNY"],
    ["900901", "900901.SH", "1.900901", "USD"],
    ["200002", "200002.SZ", "0.200002", "HKD"],
    ["920002", "920002.BJ", "0.920002", "CNY"],
    ["00700", "00700.HK", "116.00700", "HKD"],
    ["80700.HK", "80700.HK", "116.80700", "CNY"],
    ["09081.HK", "09081.HK", "116.09081", "USD"],
    ["xau/usd", "XAUUSD", "122.XAU", "USD"],
  ]) {
    assert.equal(normalizeTickerSymbol(raw), symbol);
    assert.deepEqual(resolveEastmoneyInstrument(raw), { symbol, secid, currency, market: symbol === "XAUUSD" ? "GOLD" : symbol.split(".")[1] });
  }
  assert.equal(resolveEastmoneyInstrument("AAPL"), null);
  assert.equal(resolveEastmoneyInstrument("GC=F"), null);
  assert.equal(resolveEastmoneyInstrument("00700.SH"), null);
  assert.equal(eastmoneySymbolFromSuggestion("200002", "150.200002", "基金"), null);
  assert.equal(eastmoneySymbolFromSuggestion("000001", "1.000001", "指数"), "000001.SH");
});

test("parses close before high, scales mainland lots, rejects dirty bars and preserves true intraday time", () => {
  const bars = parseEastmoneyBars([
    "2026-10-09 10:30,10,12,13,9,20",
    "2026-10-09 09:45,9,10,11,8,5",
    "2026-10-09 10:30,10,12.5,13,9,21",
    "2026-10-09 11:30,20,12,13,9,20",
    "bad-date,10,12,13,9,20",
  ], true, 100);
  assert.equal(bars.length, 2);
  assert.equal(bars[0].candle.time, Date.parse("2026-10-09T09:45:00+08:00") / 1000);
  assert.equal(bars[1].candle.close, 12.5);
  assert.equal(bars[1].volume, 2100);
  assert.equal(parseEastmoneyBars(["2026-10-09,10,12,13,9,20"], false, 1)[0].candle.time,
    Date.parse("2026-10-09T00:00:00Z") / 1000);
});

test("4h buckets put end-labelled bars on the correct side of a boundary", () => {
  const bars = parseEastmoneyBars([
    "2026-10-09 07:00,10,11,12,9,2",
    "2026-10-09 08:00,11,13,14,10,3",
    "2026-10-09 09:00,13,12,14,11,4",
  ], true, 1);
  const aggregated = aggregateEastmoneyFourHours(bars);
  assert.equal(aggregated.length, 2);
  assert.equal(aggregated[0].candle.time, Date.parse("2026-10-09T04:00:00+08:00") / 1000);
  assert.deepEqual({ ...aggregated[0].candle, time: undefined }, { time: undefined, open: 10, close: 13, high: 14, low: 9 });
  assert.equal(aggregated[0].volume, 5);
});

test("gold ignores stock adjustment, reports unavailable volume and stops paging at bounded history", async t => {
  let calledUrl = "";
  t.mock.method(globalThis, "fetch", async (url: string) => {
    calledUrl = String(url);
    return new Response(JSON.stringify({ rc: 0, data: { name: "黄金/美元", klines: [
      "2026-10-09 10:00,4100,4102,4103,4099,0",
      "2026-10-09 11:00,4102,4101,4104,4100,0",
    ] } }), { headers: { "Content-Type": "application/json" } });
  });
  const request = { symbol: "XAUUSD", interval: "1h", limit: 300, adjustment: "forward" as const, window: {} };
  const payload = await eastmoneyKlineProvider.fetch(request);
  assert.equal(new URL(calledUrl).searchParams.get("fqt"), "0");
  assert.equal(payload.volumeAvailable, false);
  assert.equal(payload.volumes, undefined);
  assert.equal(payload.hasMoreOlder, false);
  assert.equal(payload.candles.length, 2);
  const older = await eastmoneyKlineProvider.fetch({ ...request, window: { beforeTimeSec: payload.candles[0].time as number } });
  assert.equal(older.candles.length, 0);
  assert.equal(older.hasMoreOlder, false);
});

test("daily before paging bounds the upstream date and strictly excludes the cut", async t => {
  let calledUrl = "";
  t.mock.method(globalThis, "fetch", async (url: string) => {
    calledUrl = String(url);
    return new Response(JSON.stringify({ rc: 0, data: { name: "云赛B股", decimal: 3, klines: [
      "2026-10-08,1,2,3,1,100", "2026-10-09,2,3,4,2,200",
    ] } }));
  });
  const result = await eastmoneyKlineProvider.fetch({ symbol: "900901.SH", interval: "1d", limit: 300, adjustment: "backward", window: { beforeTimeSec: Date.parse("2026-10-09T00:00:00Z") / 1000 } });
  assert.equal(new URL(calledUrl).searchParams.get("end"), "20261008");
  assert.equal(new URL(calledUrl).searchParams.get("fqt"), "2");
  assert.equal(result.candles.length, 1);
  assert.equal(result.volumes?.[0], 10000);
  assert.equal(result.pricePrecision, 3);
});

test("explicit range filters intraday history and missing instruments are errors", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ rc: 0, data: { name: "腾讯", klines: [
    "2026-10-09 10:00,10,12,13,9,20", "2026-10-09 11:00,12,13,14,11,30",
  ] } })));
  const from = Date.parse("2026-10-09T10:30:00+08:00") / 1000;
  const result = await eastmoneyKlineProvider.fetch({ symbol: "00700.HK", interval: "1h", limit: 300, adjustment: "none", window: { fromTimeSec: from, toTimeSec: from + 3600 } });
  assert.equal(result.candles.length, 1);
  assert.equal(result.volumes?.[0], 30);
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ rc: 0, data: null })));
  await assert.rejects(eastmoneyKlineProvider.fetch({ symbol: "999999.SH", interval: "1d", limit: 300, adjustment: "none", window: {} }), /未找到标的/);
});
