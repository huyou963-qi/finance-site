import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultMacroSeriesColor,
  MACRO_SERIES_COLOR_PALETTE,
  macroPayloadToChartOption,
} from "./macroChartOption";

test("default macro series colors are stable and wrap by series index", () => {
  assert.equal(defaultMacroSeriesColor(0), MACRO_SERIES_COLOR_PALETTE[0]);
  assert.equal(defaultMacroSeriesColor(2), MACRO_SERIES_COLOR_PALETTE[2]);
  assert.equal(
    defaultMacroSeriesColor(MACRO_SERIES_COLOR_PALETTE.length),
    MACRO_SERIES_COLOR_PALETTE[0],
  );
});

test("time-series chart exposes the same palette used by single-chart settings", () => {
  const option = macroPayloadToChartOption({
    categories: ["2025-01", "2025-02"],
    series: [
      { key: "a", name: "A", data: [1, 2] },
      { key: "b", name: "B", data: [2, 3] },
    ],
  });

  assert.deepEqual(option.color, [...MACRO_SERIES_COLOR_PALETTE]);
});
