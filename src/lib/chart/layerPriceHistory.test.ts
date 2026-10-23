import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadLayerPriceHistory } from "./layerPriceHistory";
import { deriveLayerSeries } from "./deriveLayerSeries";
import { createChartLayer } from "./chartLayers";

const points = (times: number[], close = 10) => times.map((time) => ({ time, close }));

describe("layer price history", () => {
  it("pages past the server limit to cover the main chart's earlier dates", async () => {
    const requests: (number | undefined)[] = [];
    const all = points([1, 2, 3, 4, 5, 6]);
    const result = await loadLayerPriceHistory(async (before) => {
      requests.push(before);
      // A fixed server cap, regardless of the main chart's candle count.
      return all.filter((p) => before == null || p.time < before).slice(-2);
    }, 2);
    assert.deepEqual(requests, [undefined, 5, 3]);
    assert.deepEqual(result, all);
  });

  it("extends both legs of XLK / XLP after the main chart loads older history", async () => {
    const load = (close: number, from: number) => loadLayerPriceHistory(async (before) =>
      points([1, 2, 3, 4], close).filter((p) => before == null || p.time < before).slice(-2), from);
    for (const from of [3, 1]) {
      const [XLK, XLP] = await Promise.all([load(20, from), load(10, from)]);
      const layers = [createChartLayer({ kind: "expr", expr: "XLK / XLP" })];
      const [ratio] = deriveLayerSeries({ layers, compareMode: false }, {
        primaryCloses: points([1, 2, 3, 4].filter((time) => time >= from)),
        priceBySymbol: { XLK, XLP }, fundamentalsBySymbol: {},
      });
      assert.equal(ratio!.points[0]!.time, from);
      assert.ok(ratio!.points.every((p) => p.value === 2));
    }
  });

  it("stops at an asset's inception when there is no older page", async () => {
    const requests: (number | undefined)[] = [];
    const result = await loadLayerPriceHistory(async (before) => {
      requests.push(before);
      return before == null ? points([4, 5]) : [];
    }, 1);
    assert.deepEqual(result, points([4, 5]));
    assert.deepEqual(requests, [undefined, 4]);
  });

  it("stops if a provider ignores before, without duplicating boundary points", async () => {
    let calls = 0;
    const result = await loadLayerPriceHistory(async () => {
      calls++;
      return points([3, 4, 3]);
    }, 1);
    assert.equal(calls, 2);
    assert.deepEqual(result, points([3, 4]));
  });

  it("cancels paging when the symbol or interval changes", async () => {
    const controller = new AbortController();
    let calls = 0;
    const result = await loadLayerPriceHistory(async () => {
      calls++;
      controller.abort();
      return points([3, 4]);
    }, 1, controller.signal);
    assert.equal(calls, 1);
    assert.deepEqual(result, []);
  });

  it("propagates failed history requests so the layer shows a loading error", async () => {
    await assert.rejects(loadLayerPriceHistory(async (before) => {
      if (before != null) throw new Error("history unavailable");
      return points([3, 4]);
    }, 1), /history unavailable/);
  });
});

it("a failed expression leg clears the ratio instead of using another asset", () => {
  const layers = [createChartLayer({ kind: "expr", expr: "XLK / XLP" })];
   const [ratio] = deriveLayerSeries({ layers, compareMode: false }, {
     primaryCloses: points([1, 2], 100),
     priceBySymbol: { XLK: points([1, 2], 20), XLP: [] },
     fundamentalsBySymbol: {},
   });
   assert.deepEqual(ratio!.points, []);
   assert.ok(ratio!.error);
 });
