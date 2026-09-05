import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";
import {
  FINRA_MARGIN_STATISTICS_SERIES,
  type FinraMarginSeriesKey,
} from "./catalog";

const SHEET_NAME = "Customer Margin Balances";
const DATE_COL_HEADER = "Year-Month";

export type ParsedFinraMarginStatistics = {
  /** 每条分项独立的观测点数组——2010-02 前 free_credit_margin 列不存在，数组会更短 */
  pointsBySeries: Map<FinraMarginSeriesKey, ObservationPoint[]>;
  latestObsDateBySeries: Map<FinraMarginSeriesKey, Date>;
  skippedInvalid: number;
};

function parseYearMonth(text: unknown): { y: number; m: number } | null {
  if (typeof text !== "string") return null;
  const m = /^(\d{4})-(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12) return null;
  return { y, m: mo };
}

/**
 * 解析 FINRA `margin-statistics.xlsx` 的 "Customer Margin Balances" sheet →
 * 三条分项各自的月度观测点。
 *
 * 防御：sheet/表头缺失、0 有效点、日期解析失败、值越界一律 throw 或跳过计入
 * skippedInvalid，绝不写入可疑值（源改版报错而非静默取错）。
 */
export function parseFinraMarginStatistics(
  wb: XLSX.WorkBook,
): ParsedFinraMarginStatistics {
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) {
    throw new Error(
      `FINRA Margin Statistics：缺 sheet "${SHEET_NAME}"（实际：${wb.SheetNames.join(",")}；源结构可能已变）`,
    );
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
  });

  const headerRow = rows.find((row) => row[0] === DATE_COL_HEADER);
  if (!headerRow) {
    throw new Error(
      `FINRA Margin Statistics：未找到含 "${DATE_COL_HEADER}" 的表头行（源结构可能已变）`,
    );
  }
  const headerIdx = rows.indexOf(headerRow);

  // 按表头文本定位每条分项的列号，源改列顺序时仍能命中；找不到锚点分项（首列
  // debit_balances）直接 throw，找不到的其余分项视为该列在源里已被移除。
  const colIndexBySeries = new Map<FinraMarginSeriesKey, number>();
  for (const series of FINRA_MARGIN_STATISTICS_SERIES) {
    const idx = headerRow.findIndex((cell) => cell === series.columnHeader);
    if (idx >= 0) colIndexBySeries.set(series.seriesKey, idx);
  }
  if (!colIndexBySeries.has("debit_balances")) {
    throw new Error(
      `FINRA Margin Statistics：表头缺 "${
        FINRA_MARGIN_STATISTICS_SERIES.find((s) => s.seriesKey === "debit_balances")!
          .columnHeader
      }" 列（源结构可能已变）`,
    );
  }

  const pointsBySeries = new Map<FinraMarginSeriesKey, ObservationPoint[]>();
  const latestObsDateBySeries = new Map<FinraMarginSeriesKey, Date>();
  for (const key of colIndexBySeries.keys()) pointsBySeries.set(key, []);

  const rangeBySeries = new Map(
    FINRA_MARGIN_STATISTICS_SERIES.map((s) => [s.seriesKey, s.valueRange] as const),
  );
  const seenMonths = new Set<string>();
  let skippedInvalid = 0;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]!;
    const rawDate = row[0];
    if (rawDate == null || rawDate === "") continue; // 表尾空行
    const ym = parseYearMonth(rawDate);
    if (!ym) {
      skippedInvalid += 1;
      continue;
    }
    const key = `${ym.y}-${ym.m}`;
    if (seenMonths.has(key)) continue; // 同月重复行只取先遇到的一条
    seenMonths.add(key);
    const obsDate = new Date(Date.UTC(ym.y, ym.m - 1, 1));
    if (obsDate.getTime() > todayUtc) {
      skippedInvalid += 1;
      continue;
    }

    for (const [seriesKey, colIdx] of colIndexBySeries) {
      const raw = row[colIdx];
      if (raw == null || raw === "") continue; // 该分项该月无值（如 2010-02 前的 free_credit_margin），正常跳过
      const value = typeof raw === "number" ? raw : Number(raw);
      const [lo, hi] = rangeBySeries.get(seriesKey)!;
      if (!Number.isFinite(value) || value < lo || value > hi) {
        skippedInvalid += 1;
        continue;
      }
      pointsBySeries.get(seriesKey)!.push({ obsDate, value });
      const prevLatest = latestObsDateBySeries.get(seriesKey);
      if (!prevLatest || obsDate > prevLatest) latestObsDateBySeries.set(seriesKey, obsDate);
    }
  }

  for (const [seriesKey, points] of pointsBySeries) {
    if (points.length === 0) {
      throw new Error(`FINRA Margin Statistics：分项 ${seriesKey} 解析后 0 个有效点（结构或数值异常）`);
    }
    points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  }

  return { pointsBySeries, latestObsDateBySeries, skippedInvalid };
}
