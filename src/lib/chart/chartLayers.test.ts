import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyLayerTemplate,
  chartLayersStructKey,
  CHART_LAYER_MAX,
  createChartLayer,
  defaultAxisForSource,
  sanitizeChartLayersPrefs,
} from "./chartLayers";

describe("chartLayers", () => {
  it("defaults raw price to left axis", () => {
    const axis = defaultAxisForSource({
      kind: "price",
      symbol: "MSFT",
      field: "close",
    });
    assert.equal(axis.mode, "left");
  });

  it("caps at CHART_LAYER_MAX on sanitize", () => {
    const layers = Array.from({ length: 8 }, (_, i) =>
      createChartLayer({ kind: "price", symbol: `A${i}`, field: "close" }),
    );
    const prefs = sanitizeChartLayersPrefs({ layers, compareMode: false });
    assert.equal(prefs.layers.length, CHART_LAYER_MAX);
  });

  it("struct key ignores data but sees axis change", () => {
    const a = createChartLayer({ kind: "price", symbol: "SPY", field: "close" });
    const prefs1 = { layers: [a], compareMode: false };
    const prefs2 = {
      layers: [{ ...a, axis: { mode: "right" as const } }],
      compareMode: false,
    };
    assert.notEqual(chartLayersStructKey(prefs1), chartLayersStructKey(prefs2));
  });

  it("vsSpy template adds SPY and ratio", () => {
    const layers = applyLayerTemplate("vsSpy", "AAPL", []);
    assert.ok(layers.length >= 2);
    assert.ok(layers.some((l) => l.source.kind === "price" && l.source.symbol === "SPY"));
    assert.ok(
      layers.some(
        (l) => l.source.kind === "expr" && /AAPL\s*\/\s*SPY/.test(l.source.expr),
      ),
    );
  });
});
