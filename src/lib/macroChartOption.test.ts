import assert from "node:assert/strict";
import test from "node:test";
import * as echarts from "echarts";
import {
  DEFAULT_MACRO_CHART_DISPLAY_CONFIG,
  defaultMacroSeriesColor,
  computeAxisExtentFromSlice,
  type MacroSeriesChartType,
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

test("all chart types negate reversed display values on the shared axis without mutating the source", () => {
  const chartTypes: MacroSeriesChartType[] = ["line", "bar", "area", "stackArea", "stackBar", "stepLine", "scatter", "dashedLine"];
  for (const chartType of chartTypes) {
    const slice = {
      categories: ["2025-01", "2025-02", "2025-03", "2025-04"],
      series: [
        { key: "normal", name: "Normal", data: [1, 2, null, 0] },
        { key: "reversed", name: "Reversed", data: [10, -20, null, 0] },
      ],
    };
    const option = macroPayloadToChartOption(slice, {
      seriesVisualMap: { reversed: { inverse: true, chartType } },
    });
    const axes = option.yAxis as Array<{ inverse?: boolean }>;
    const series = option.series as Array<{ yAxisIndex?: number; data?: unknown[] }>;
    assert.equal(axes.length, 1);
    assert.ok(!axes[0]!.inverse);
    assert.equal(series[0]!.yAxisIndex, series[1]!.yAxisIndex);
    assert.deepEqual(series[1]!.data, [-10, 20, null, 0]);
    assert.deepEqual(slice.series[1]!.data, [10, -20, null, 0]);
  }
});

for (const compact of [false, true]) {
  test(`long/short stacks share a centered zero and render in opposite directions (${compact ? "mobile" : "desktop"})`, () => {
    const slice = {
      categories: ["2025-01", "2025-02"],
      series: [
        { key: "net", name: "Net", data: [80, 120] },
        { key: "long", name: "Long", data: [100, 150] },
        { key: "short", name: "Short", data: [20, 30] },
        { key: "short2", name: "Short 2", data: [10, 15] },
      ],
    };
    const seriesVisualMap = {
      long: { axis: "right" as const, chartType: "stackBar" as const },
      short: { axis: "right" as const, chartType: "stackBar" as const, inverse: true },
      short2: { axis: "right" as const, chartType: "stackBar" as const, inverse: true },
    };
    const extent = computeAxisExtentFromSlice(slice, seriesVisualMap, "right")!;
    assert.equal(extent.min, -extent.max);
    assert.ok(extent.max >= 150);
    assert.ok(extent.min <= -45);
    const option = macroPayloadToChartOption(slice, { compact, seriesVisualMap });
    const axes = option.yAxis as Array<{ min: number; max: number }>;
    assert.equal(axes.length, 2);
    assert.equal(axes[1]!.min, -axes[1]!.max);
    const series = option.series as Array<{ stack?: string; yAxisIndex?: number; data?: unknown[] }>;
    assert.equal(series[1]!.stack, series[2]!.stack);
    assert.equal(series[1]!.yAxisIndex, 1);
    assert.equal(series[2]!.yAxisIndex, 1);
    assert.deepEqual(series[2]!.data, [-20, -30]);

    const chart = echarts.init(null, undefined, { renderer: "svg", ssr: true, width: compact ? 390 : 1280, height: 480 });
    try {
      chart.setOption({ ...option, animation: false });
      const pixel = (v: number) => chart.convertToPixel({ yAxisIndex: 1 }, v) as number;
      assert.ok(pixel(100) < pixel(0));
      assert.ok(pixel(-20) > pixel(0));
      assert.ok(Math.abs(pixel(0) - (pixel(axes[1]!.min) + pixel(axes[1]!.max)) / 2) < 0.01);
      assert.ok(chart.renderToSVGString().includes("<path"));
    } finally {
      chart.dispose();
    }
    const manual = macroPayloadToChartOption(slice, { seriesVisualMap, axisRanges: { right: { mode: "manual", min: -50, max: 200 } } });
    assert.equal((manual.yAxis as typeof axes)[1]!.min, -50);
    assert.equal((manual.yAxis as typeof axes)[1]!.max, 200);
  });
}

test("negative stacks include zero and sum each sign independently", () => {
  const slice = { categories: ["2025-01"], series: [
    { key: "a", name: "A", data: [100] },
    { key: "b", name: "B", data: [80] },
    { key: "c", name: "C", data: [170] },
  ] };
  const extent = computeAxisExtentFromSlice(slice, {
    a: { chartType: "stackBar" }, b: { chartType: "stackBar" }, c: { chartType: "stackBar", inverse: true },
  }, "left")!;
  assert.ok(extent.max >= 180);
  assert.ok(extent.min <= -170);
  const negative = computeAxisExtentFromSlice({ ...slice, series: [slice.series[0]!] }, { a: { chartType: "stackBar", inverse: true } }, "left")!;
  assert.equal(negative.max, 0);
  assert.ok(negative.min <= -100);
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

  const series = option.series as Array<{
    lineStyle?: { color?: string };
    endLabel?: { show?: boolean; color?: string; borderColor?: string };
  }>;
  assert.equal(series[0]!.endLabel?.show, true);
  assert.equal(series[1]!.endLabel?.show, true);
  assert.equal(series[0]!.endLabel?.color, series[0]!.lineStyle?.color);
  assert.equal(series[0]!.endLabel?.borderColor, series[0]!.lineStyle?.color);
  assert.equal(series[1]!.endLabel?.color, series[1]!.lineStyle?.color);
  assert.equal(series[1]!.endLabel?.borderColor, series[1]!.lineStyle?.color);
});
