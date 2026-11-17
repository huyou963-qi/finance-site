import { compareMacroPeriodLabels } from "@/lib/macroPeriodLabel";

/** BLS Table A 风格默认展示近 7 个月 */
export const CPI_MOM_MATRIX_DEFAULT_MONTHS = 7;

/** 开始月到结束月（含）最长跨度 */
export const CPI_MOM_MATRIX_MAX_MONTHS = 12;

/** 解析 `YYYY-MM` / `YYYY-MM-DD` 为年月 */
export function parseCpiMomYm(period: string): { y: number; m: number } | null {
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(period.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(y) || month < 1 || month > 12) return null;
  return { y, m: month };
}

/** 含端点的日历月数：`2026-04`→`2026-10` = 7 */
export function cpiMomMonthSpanInclusive(start: string, end: string): number | null {
  const a = parseCpiMomYm(start);
  const b = parseCpiMomYm(end);
  if (!a || !b) return null;
  return (b.y - a.y) * 12 + (b.m - a.m) + 1;
}

/** 按月平移，保留原标签形态（`YYYY-MM` 或 `YYYY-MM-DD`） */
export function shiftCpiMomMonthPeriod(period: string, deltaMonths: number): string | null {
  const m = /^(\d{4})-(\d{2})(-\d{2})?$/.exec(period.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + deltaMonths, 1));
  const y = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return m[3] ? `${y}-${mm}${m[3]}` : `${y}-${mm}`;
}

function findLatestAtMost(availableSorted: readonly string[], target: string): string {
  let best = availableSorted[0]!;
  for (const p of availableSorted) {
    if (compareMacroPeriodLabels(p, target) <= 0) best = p;
    else break;
  }
  return best;
}

function findEarliestAtLeast(availableSorted: readonly string[], target: string): string {
  for (const p of availableSorted) {
    if (compareMacroPeriodLabels(p, target) >= 0) return p;
  }
  return availableSorted[availableSorted.length - 1]!;
}

/** 默认：结束=最新可用月，开始=往前 defaultMonths−1 个可用月 */
export function defaultCpiMomMonthRange(
  availableSorted: readonly string[],
  defaultMonths = CPI_MOM_MATRIX_DEFAULT_MONTHS,
): { start: string; end: string } | null {
  if (availableSorted.length === 0) return null;
  const end = availableSorted[availableSorted.length - 1]!;
  const startIdx = Math.max(0, availableSorted.length - Math.max(1, defaultMonths));
  return { start: availableSorted[startIdx]!, end };
}

/**
 * 钳制开始/结束月：须落在可用列表内、start≤end、日历跨度（含端点）≤ maxMonths。
 * `changed` 表示用户刚改了哪一侧，超长时优先保留该侧。
 */
export function clampCpiMomMonthRange(
  availableSorted: readonly string[],
  nextStart: string,
  nextEnd: string,
  changed: "start" | "end",
  maxMonths = CPI_MOM_MATRIX_MAX_MONTHS,
): { start: string; end: string } | null {
  if (availableSorted.length === 0) return null;
  const first = availableSorted[0]!;
  const last = availableSorted[availableSorted.length - 1]!;

  let start = availableSorted.includes(nextStart) ? nextStart : first;
  let end = availableSorted.includes(nextEnd) ? nextEnd : last;

  if (compareMacroPeriodLabels(start, end) > 0) {
    if (changed === "start") end = start;
    else start = end;
  }

  const span = cpiMomMonthSpanInclusive(start, end);
  if (span != null && span > maxMonths) {
    if (changed === "start") {
      const target = shiftCpiMomMonthPeriod(start, maxMonths - 1);
      end = target ? findLatestAtMost(availableSorted, target) : start;
      if (compareMacroPeriodLabels(end, start) < 0) end = start;
    } else {
      const target = shiftCpiMomMonthPeriod(end, -(maxMonths - 1));
      start = target ? findEarliestAtLeast(availableSorted, target) : end;
      if (compareMacroPeriodLabels(start, end) > 0) start = end;
    }
  }

  return { start, end };
}

/** 可用期内落在 [start, end] 的列（已排序） */
export function filterCpiMomColumns(
  availableSorted: readonly string[],
  start: string,
  end: string,
): string[] {
  return availableSorted.filter(
    (p) =>
      compareMacroPeriodLabels(p, start) >= 0 && compareMacroPeriodLabels(p, end) <= 0,
  );
}
