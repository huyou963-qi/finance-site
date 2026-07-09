import { parseMacroDateLabelToUtcMs } from "@/lib/macroPeriodLabel";

/** NBER 衰退区间（由 FRED USREC 0/1 连续段压缩） */
export type NberRecessionBand = {
  /** 衰退首月 1 日 00:00 UTC */
  startMs: number;
  /** 衰退末月最后一刻（下月 1 日 00:00 UTC 之前） */
  endMs: number;
  /** 源标签（多为 YYYY-MM 或 YYYY-MM-01） */
  startLabel: string;
  endLabel: string;
};

export type EChartsCategoryMarkAreaPair = [
  { xAxis: string },
  { xAxis: string },
];

/** 月度标签 → [月初, 下月初) */
function monthBoundsFromLabel(label: string): { startMs: number; endMs: number } | null {
  const ms = parseMacroDateLabelToUtcMs(label);
  if (ms == null) return null;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const startMs = Date.UTC(y, m, 1);
  const endMs = Date.UTC(y, m + 1, 1) - 1;
  return { startMs, endMs };
}

/**
 * 将 USREC 月度 0/1 观测压成衰退区间（trough method：连续值为 1 的月份）。
 */
export function usrecSeriesToBands(
  categories: string[],
  values: (number | null)[],
): NberRecessionBand[] {
  const bands: NberRecessionBand[] = [];
  let runStart: string | null = null;
  let runStartMs = 0;
  let runEndLabel = "";
  let runEndMs = 0;

  const flush = () => {
    if (runStart == null) return;
    bands.push({
      startMs: runStartMs,
      endMs: runEndMs,
      startLabel: runStart,
      endLabel: runEndLabel,
    });
    runStart = null;
  };

  const n = Math.min(categories.length, values.length);
  for (let i = 0; i < n; i++) {
    const label = categories[i]!.trim();
    const v = values[i];
    const inRecession = typeof v === "number" && Number.isFinite(v) && v >= 0.5;
    if (!inRecession) {
      flush();
      continue;
    }
    const bounds = monthBoundsFromLabel(label);
    if (!bounds) continue;
    if (runStart == null) {
      runStart = label;
      runStartMs = bounds.startMs;
    }
    runEndLabel = label;
    runEndMs = bounds.endMs;
  }
  flush();
  return bands;
}

/** 图表 category 标签覆盖的时间闭区间 */
export function categoryLabelTimeSpan(
  label: string,
): { startMs: number; endMs: number } | null {
  const trimmed = label.trim();
  if (/^\d{4}$/.test(trimmed)) {
    const y = Number(trimmed);
    return { startMs: Date.UTC(y, 0, 1), endMs: Date.UTC(y + 1, 0, 1) - 1 };
  }
  const q = /^(\d{4})-Q([1-4])$/i.exec(trimmed);
  if (q) {
    const y = Number(q[1]);
    const qi = Number(q[2]) - 1;
    const startMs = Date.UTC(y, qi * 3, 1);
    const endMs = Date.UTC(y, qi * 3 + 3, 1) - 1;
    return { startMs, endMs };
  }
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return monthBoundsFromLabel(trimmed);
  }
  if (/^\d{4}-\d{2}-01$/.test(trimmed)) {
    return monthBoundsFromLabel(trimmed);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const ms = parseMacroDateLabelToUtcMs(trimmed);
    if (ms == null) return null;
    return { startMs: ms, endMs: ms + 86_400_000 - 1 };
  }
  const ms = parseMacroDateLabelToUtcMs(trimmed);
  if (ms == null) return null;
  return { startMs: ms, endMs: ms };
}

function rangesOverlap(
  a: { startMs: number; endMs: number },
  b: { startMs: number; endMs: number },
): boolean {
  return a.startMs <= b.endMs && b.startMs <= a.endMs;
}

/**
 * 将 NBER 区间映射到当前图 category 轴上的 markArea 起止标签。
 * 无重叠的区间会被跳过。
 */
export function markAreaDataForCategories(
  chartCategories: string[],
  bands: readonly NberRecessionBand[],
): EChartsCategoryMarkAreaPair[] {
  if (!chartCategories.length || !bands.length) return [];

  const spans = chartCategories.map((c) => categoryLabelTimeSpan(c));
  const out: EChartsCategoryMarkAreaPair[] = [];

  for (const band of bands) {
    let first = -1;
    let last = -1;
    for (let i = 0; i < chartCategories.length; i++) {
      const span = spans[i];
      if (!span) continue;
      if (!rangesOverlap(span, band)) continue;
      if (first < 0) first = i;
      last = i;
    }
    if (first < 0 || last < 0) continue;
    out.push([
      { xAxis: chartCategories[first]! },
      { xAxis: chartCategories[last]! },
    ]);
  }
  return out;
}

/** FRED 风格浅灰衰退阴影 */
export const NBER_RECESSION_MARK_AREA_STYLE = {
  silent: true as const,
  itemStyle: {
    color: "rgba(148, 163, 184, 0.18)",
    borderWidth: 0,
  },
  label: { show: false as const },
};
