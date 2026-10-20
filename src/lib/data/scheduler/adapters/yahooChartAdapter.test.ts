import assert from "node:assert/strict";
import test from "node:test";
import { fetchYahooChartIncremental } from "./yahooChartAdapter";
const start = Date.parse("2026-10-14T22:00:00Z") / 1000;
const end = Date.parse("2026-10-15T21:00:00Z") / 1000;
const metadata = { scrape: { symbol: "CL=F", completedSessionsOnly: "true" } };

function chart(session: boolean) {
  return new Response(JSON.stringify({ chart: { result: [{
    meta: { symbol: "CL=F", dataGranularity: "1d", ...(session ? { currentTradingPeriod: { regular: { start, end } } } : {}) },
    timestamp: [start - 86400, start],
    indicators: { quote: [{ close: [95.09, 94.02] }] },
  }] } }));
}
test("finalized WTI excludes ongoing overnight session without changing live-chart transport", async (t) => {
  t.mock.method(Date, "now", () => Date.parse("2026-10-15T04:00:00Z"));
  t.mock.method(globalThis, "fetch", async () => chart(true));
  const strict = await fetchYahooChartIncremental(metadata, "nymex_wti_futures", "2026-10-01");
  assert.deepEqual(strict.points.map((p) => p.value), [95.09]);
  const live = await fetchYahooChartIncremental({ scrape: { symbol: "CL=F" } }, "other", "2026-10-01");
  assert.deepEqual(live.points.map((p) => p.value), [95.09, 94.02]);
});
test("finalized WTI waits 15 minutes beyond source session end", async (t) => {
  t.mock.method(globalThis, "fetch", async () => chart(true));
  const now = t.mock.method(Date, "now", () => (end + 14 * 60) * 1000);
  assert.equal((await fetchYahooChartIncremental(metadata, "wti", "2026-10-01")).points.length, 1);
  now.mock.mockImplementation(() => (end + 15 * 60) * 1000);
  assert.equal((await fetchYahooChartIncremental(metadata, "wti", "2026-10-01")).points.length, 2);
});
test("finalized WTI fails closed when source omits trading session", async (t) => {
  t.mock.method(globalThis, "fetch", async () => chart(false));
  await assert.rejects(fetchYahooChartIncremental(metadata, "wti", "2026-10-01"), /缺少有效交易时段/);
});
