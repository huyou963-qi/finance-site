import type {
  MacroChartSlice,
  MacroSeriesVisualConfigMap,
} from "@/lib/macroChartOption";
import { parseMacroDateLabelToUtcMs } from "@/lib/macroPeriodLabel";
import { decorateMacroSeriesDisplayName } from "@/lib/macroSeriesDisplayName";
import type { MacroPayload } from "./types";
import type { UsFiscalView } from "./usFiscalViewTypes";

export function fiscalChartDate(label: string): number | null {
  const quarter = /^(\d{4})-?Q([1-4])$/.exec(label);
  if (quarter) return Date.UTC(Number(quarter[1]), Number(quarter[2]) * 3, 0);
  const month = /^(\d{4})-(\d{2})$/.exec(label);
  if (month) return Date.UTC(Number(month[1]), Number(month[2]), 0);
  return parseMacroDateLabelToUtcMs(label);
}

function usesHistoricalRange(view: UsFiscalView) {
  return view.id !== "B4" && view.id !== "C4";
}

export function fiscalChartSlice(
  view: UsFiscalView,
  from?: string,
  to?: string,
): MacroChartSlice {
  const start = from ? fiscalChartDate(from) : null;
  const end = to ? fiscalChartDate(to) : null;
  const indices = view.categories.flatMap((label, index) => {
    if (!usesHistoricalRange(view) || (start == null && end == null))
      return [index];
    const date = fiscalChartDate(label);
    return date != null &&
      (start == null || date >= start) &&
      (end == null || date <= end)
      ? [index]
      : [];
  });
  return {
    title: view.title,
    categories: indices.map((index) =>
      view.categories[index]!.replace(/^(\d{4})Q/, "$1-Q"),
    ),
    series: indices.length
      ? view.series.map((series, index) => ({
          key: `fiscal:${view.id}:${index}`,
          name: decorateMacroSeriesDisplayName(series.name, {
            unit: series.right ? view.rightUnit : view.unit,
            axis: series.right ? "right" : "left",
          }),
          data: indices.map((i) => series.data[i] ?? null),
        }))
      : [],
  };
}

export function fiscalChartVisuals(
  view: UsFiscalView,
): MacroSeriesVisualConfigMap {
  return Object.fromEntries(
    view.series.map((series, index) => [
      `fiscal:${view.id}:${index}`,
      {
        axis: series.right ? "right" : "left",
        chartType:
          series.type === "bar"
            ? series.stack
              ? "stackBar"
              : "bar"
            : series.dashed
              ? "dashedLine"
              : "line",
        stackGroup: series.stack,
        connectNulls: false,
        ...(view.id === "B4" ? { showSymbol: true } : {}),
      },
    ]),
  );
}

export function fiscalChartTimeline(
  views: readonly UsFiscalView[],
): MacroPayload | null {
  const dates = new Set<string>();
  let preview: Map<string, number | null> | undefined;
  for (const view of views) {
    if (!usesHistoricalRange(view)) continue;
    const points = new Map<string, number | null>();
    view.categories.forEach((label, index) => {
      const date = fiscalChartDate(label);
      if (date == null) return;
      const key = new Date(date).toISOString().slice(0, 10);
      dates.add(key);
      points.set(key, view.series[0]?.data[index] ?? null);
    });
    if (!preview || points.size > preview.size) preview = points;
  }
  if (!dates.size) return null;
  const categories = [...dates].sort();
  return {
    title: "",
    source: "mds",
    categories,
    series: [
      {
        key: `fiscal-timeline:${views.map((view) => view.id).join(",")}`,
        name: "",
        data: categories.map((date) => preview?.get(date) ?? null),
      },
    ],
  };
}
