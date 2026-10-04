import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MACRO_CHART_DISPLAY_CONFIG,
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

test("a reversed series uses its own inverse axis without changing source values", () => {
  const option = macroPayloadToChartOption(
    {
      categories: ["2025-01", "2025-02"],
      series: [
        { key: "normal", name: "Normal", data: [1, 2] },
        { key: "reversed", name: "Reversed", data: [10, 20] },
      ],
    },
    { seriesVisualMap: { reversed: { inverse: true } } },
  );

  const axes = option.yAxis as Array<{ inverse?: boolean }>;
  const series = option.series as Array<{ yAxisIndex?: number; data?: unknown[] }>;
  assert.equal(axes.length, 2);
  assert.equal(axes[series[0]!.yAxisIndex ?? 0]?.inverse, false);
  assert.equal(axes[series[1]!.yAxisIndex ?? 0]?.inverse, true);
  assert.deepEqual(series[1]!.data, [10, 20]);
});

test("a chart-level latest-value setting overrides every series in that slot", () => {
  const option = macroPayloadToChartOption(
    {
      categories: ["2025-01", "2025-02"],
      series: [
        { key: "a", name: "A", data: [1, 2] },
        { key: "b", name: "B", data: [2, 3] },
      ],
    },
    {
      slotIndex: 2,
      displayConfig: {
        ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG,
        slotShowEndLabels: { 2: true },
      },
    },
  );

  const series = option.series as Array<{ endLabel?: { show?: boolean } }>;
  assert.equal(series[0]!.endLabel?.show, true);
  assert.equal(series[1]!.endLabel?.show, true);
});
