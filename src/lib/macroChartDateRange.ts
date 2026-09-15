import { macroPeriodSortMs } from "@/lib/macroPeriodLabel";
import { indicesFromDataZoomPct } from "@/lib/timeRangeSlice";

/** 图表底部时间窗：0–100，与 MacroTimeRangeNavigator / indicesFromDataZoomPct 同口径 */
export type MacroChartRangePct = { start: number; end: number };

/** 百分比回算时的容差，避免浮点误差让 floor/ceil 落到相邻类目 */
const INDEX_EPSILON = 1e-6;

/** 类目标签 → `YYYY-MM-DD`（供 `<input type="date">`）；无法解析返回 null */
export function categoryToIsoDate(label: string): string | null {
  const ms = macroPeriodSortMs(label);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function isoToUtcMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

/**
 * 开始/结束日期 → 时间窗百分比（与 indicesFromDataZoomPct 互逆）。
 * 取 [from, to] 内的首末类目；区间内无类目时返回 null。
 */
export function rangePctFromDates(
  categories: string[],
  fromIso: string | null,
  toIso: string | null,
): MacroChartRangePct | null {
  const len = categories.length;
  if (len === 0) return null;
  const fromMs = fromIso ? isoToUtcMs(fromIso) : Number.NEGATIVE_INFINITY;
  const toMs = toIso ? isoToUtcMs(toIso) : Number.POSITIVE_INFINITY;
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return null;

  let i0 = -1;
  let i1 = -1;
  for (let i = 0; i < len; i++) {
    const ms = macroPeriodSortMs(categories[i]!);
    if (!Number.isFinite(ms)) continue;
    if (i0 < 0 && ms >= fromMs) i0 = i;
    if (ms <= toMs) i1 = i;
  }
  if (i0 < 0 || i1 < i0) return null;
  return {
    start: ((i0 + INDEX_EPSILON) / len) * 100,
    end: ((i1 + 1 - INDEX_EPSILON) / len) * 100,
  };
}

/** 时间窗百分比 → 首末类目对应的日期 */
export function datesFromRangePct(
  categories: string[],
  range: MacroChartRangePct,
): { from: string | null; to: string | null } {
  const len = categories.length;
  if (len === 0) return { from: null, to: null };
  const { i0, i1 } = indicesFromDataZoomPct(range.start, range.end, len);
  return {
    from: categoryToIsoDate(categories[i0]!),
    to: categoryToIsoDate(categories[i1]!),
  };
}

/** 默认时间窗：以时间轴最后一期为终点，向前 `years` 年；不足则展示全部 */
export function defaultRecentRangePct(
  categories: string[],
  years = 3,
): MacroChartRangePct | null {
  const last = categories.at(-1);
  const lastIso = last ? categoryToIsoDate(last) : null;
  if (!lastIso) return null;
  const from = new Date(isoToUtcMs(lastIso));
  from.setUTCFullYear(from.getUTCFullYear() - years);
  return rangePctFromDates(categories, from.toISOString().slice(0, 10), lastIso);
}

/** `YYYY-MM-DD` → `YY/MM`；手机端紧凑触发按钮用，字符串切片避免时区解析 */
export function shortMacroDate(iso: string): string {
  return `${iso.slice(2, 4)}/${iso.slice(5, 7)}`;
}
