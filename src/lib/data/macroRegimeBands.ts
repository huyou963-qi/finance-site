import { categoryLabelTimeSpan } from "@/lib/data/nberRecessionBands";

export type MacroRegimeKey = "goldilocks" | "reflation" | "stagflation" | "deflation";

export const MACRO_REGIME_SERIES = {
  growthZ: { code: "quant_regime_growth_z", key: "mds:quant_regime_growth_z", label: "增长 z" },
  inflationMomZ: { code: "quant_regime_inflation_mom_z", key: "mds:quant_regime_inflation_mom_z", label: "通胀动量 z" },
} as const;

export const MACRO_REGIME_CODES = new Set<string>(
  Object.values(MACRO_REGIME_SERIES).map((item) => item.code),
);

export type MacroRegimeBand = {
  startMs: number;
  endMs: number;
  startLabel: string;
  endLabel: string;
  regime: MacroRegimeKey;
};

export const MACRO_REGIME_VISUALS: ReadonlyArray<{
  key: MacroRegimeKey;
  label: string;
  description: string;
  color: string;
  bandColor: string;
}> = [
  { key: "goldilocks", label: "金发女孩", description: "增长加速 · 通胀回落", color: "#008300", bandColor: "rgba(0, 131, 0, 0.16)" },
  { key: "reflation", label: "再通胀", description: "增长加速 · 通胀升温", color: "#c98500", bandColor: "rgba(201, 133, 0, 0.16)" },
  { key: "stagflation", label: "滞胀", description: "增长减速 · 通胀升温", color: "#d55181", bandColor: "rgba(213, 81, 129, 0.16)" },
  { key: "deflation", label: "通缩衰退", description: "增长减速 · 通胀回落", color: "#3987e5", bandColor: "rgba(57, 135, 229, 0.16)" },
];

const VISUAL_BY_KEY = new Map(MACRO_REGIME_VISUALS.map((item) => [item.key, item]));

export type EChartsRegimeMarkAreaPair = [
  { xAxis: string; name: string; itemStyle: { color: string; borderWidth: number } },
  { xAxis: string },
];

function overlaps(a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }) {
  return a.startMs <= b.endMs && b.startMs <= a.endMs;
}

export function macroRegimeMarkAreaData(
  chartCategories: string[],
  bands: readonly MacroRegimeBand[],
): EChartsRegimeMarkAreaPair[] {
  const spans = chartCategories.map(categoryLabelTimeSpan);
  const out: EChartsRegimeMarkAreaPair[] = [];
  for (const band of bands) {
    let first = -1;
    let last = -1;
    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      if (!span || !overlaps(span, band)) continue;
      if (first < 0) first = i;
      last = i;
    }
    if (first < 0 || last < 0) continue;
    const visual = VISUAL_BY_KEY.get(band.regime);
    if (!visual) continue;
    out.push([
      {
        xAxis: chartCategories[first]!,
        name: `${visual.label}｜${visual.description}`,
        itemStyle: { color: visual.bandColor, borderWidth: 0 },
      },
      { xAxis: chartCategories[last]! },
    ]);
  }
  return out;
}

export const MACRO_REGIME_MARK_AREA_STYLE = {
  silent: true as const,
  label: { show: false as const },
};
