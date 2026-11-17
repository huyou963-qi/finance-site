/**
 * 点格子看时序：为单个指标生成多报告期列（纯函数），再走现有 query 接口取数。
 */

import { getIndicator, normalizeParams } from "./indicatorRegistry";
import type { ColumnSpec, MultiPeriod, PeriodSlot } from "./types";

/** 报表/比率/成长：最近若干财年的年报列 */
export function buildHistoryColumns(
  indicatorId: string,
  opts: { years?: number; asOfToday?: string; keyPrefix?: string } = {},
): ColumnSpec[] | null {
  const def = getIndicator(indicatorId);
  if (!def) return null;
  const src = def.source;
  const years = opts.years ?? 8;
  const today = opts.asOfToday ?? new Date().toISOString().slice(0, 10);
  const y = Number(today.slice(0, 4));
  const prefix = opts.keyPrefix ?? "h";

  if (src.kind === "statement" || src.kind === "ratio" || src.kind === "growth") {
    const multi: MultiPeriod = {
      fromYear: y - years,
      toYear: y,
      slots: ["FY"] as PeriodSlot[],
    };
    const cols: ColumnSpec[] = [];
    for (let year = multi.fromYear; year <= multi.toYear; year++) {
      cols.push({
        key: `${prefix}${year}`,
        indicatorId,
        params: normalizeParams(def, { period: { kind: "FY", year } }),
        groupId: `${prefix}-grp`,
        multi,
      });
    }
    return cols;
  }

  if (src.kind === "price" || src.kind === "trend" || src.kind === "valuation" || src.kind === "technical" || src.kind === "insider") {
    // 按月末回溯：最近 12 个截止日
    const cols: ColumnSpec[] = [];
    for (let i = years - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(y, Number(today.slice(5, 7)) - 1 - i, 1));
      // 取该月最后一天
      const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
      const date = end.toISOString().slice(0, 10);
      cols.push({
        key: `${prefix}${date}`,
        indicatorId,
        params: normalizeParams(def, { asOf: { kind: "date", date } }),
      });
    }
    return cols;
  }

  return null;
}
