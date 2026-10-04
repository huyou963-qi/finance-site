import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";
import type { EiaWpsrSeries } from "./catalog";

/**
 * EIA WPSR XLS structure (verified against five live fixtures on 2026-10-04):
 *
 * - OLE/BIFF workbook, sheets `Contents` and `Data 1`.
 * - `Data 1` row 1 is a description; row 2 is `Sourcekey | <EIA id>`;
 *   row 3 is `Date | <description>`; following rows are Excel serial date + value.
 * - Dates are EIA week-ending Fridays and values are already in the published unit.
 * - `Contents` exposes `Latest Data for`; it must equal the final parsed observation.
 *
 * Anchors, source key, dates, chronology and series-specific value bounds are all
 * asserted. A format change fails loudly instead of writing a plausible wrong column.
 */

const DATA_SHEET = "Data 1";
const CONTENTS_SHEET = "Contents";

export type ParsedEiaWpsrWorkbook = {
  points: ObservationPoint[];
  latestObsDate: Date;
  skippedInvalid: number;
};

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseExcelDate(raw: unknown, rowNumber: number): Date {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    throw new Error(`EIA WPSR：第 ${rowNumber} 行日期不是 Excel 序列号`);
  }
  const parsed = XLSX.SSF.parse_date_code(raw);
  if (!parsed || !parsed.y || !parsed.m || !parsed.d) {
    throw new Error(`EIA WPSR：第 ${rowNumber} 行日期无法解析（${String(raw)}）`);
  }
  const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  if (
    date.getUTCFullYear() !== parsed.y ||
    date.getUTCMonth() !== parsed.m - 1 ||
    date.getUTCDate() !== parsed.d
  ) {
    throw new Error(`EIA WPSR：第 ${rowNumber} 行日期越界（${String(raw)}）`);
  }
  return date;
}

function parseUsDate(raw: unknown): Date {
  if (typeof raw !== "string") {
    throw new Error("EIA WPSR：Contents 缺少 Latest Data for 日期");
  }
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  if (!match) throw new Error(`EIA WPSR：Latest Data for 日期格式异常（${raw}）`);
  const date = new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])));
  if (Number.isNaN(date.getTime())) throw new Error(`EIA WPSR：Latest Data for 日期无效（${raw}）`);
  return date;
}

export function parseEiaWpsrWorkbook(
  workbook: XLSX.WorkBook,
  series: EiaWpsrSeries,
): ParsedEiaWpsrWorkbook {
  const dataSheet = workbook.Sheets[DATA_SHEET];
  const contentsSheet = workbook.Sheets[CONTENTS_SHEET];
  if (!dataSheet || !contentsSheet) {
    throw new Error(
      `EIA WPSR ${series.sourceSeriesKey}：缺少 ${CONTENTS_SHEET}/${DATA_SHEET} sheet（实际 ${workbook.SheetNames.join(", ")}）`,
    );
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(dataSheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  if (
    rows[0]?.[0] !== "Back to Contents" ||
    rows[1]?.[0] !== "Sourcekey" ||
    rows[1]?.[1] !== series.sourceSeriesKey ||
    rows[2]?.[0] !== "Date"
  ) {
    throw new Error(
      `EIA WPSR ${series.sourceSeriesKey}：Data 1 锚点或 Sourcekey 不匹配，源结构可能已变`,
    );
  }

  const points: ObservationPoint[] = [];
  let previousTime = -Infinity;
  for (let index = 3; index < rows.length; index++) {
    const rawDate = rows[index]?.[0];
    const rawValue = rows[index]?.[1];
    if (rawDate == null && rawValue == null) continue;

    const obsDate = parseExcelDate(rawDate, index + 1);
    const value = typeof rawValue === "number" ? rawValue : Number.NaN;
    if (!Number.isFinite(value)) {
      throw new Error(`EIA WPSR ${series.sourceSeriesKey}：第 ${index + 1} 行数值无效`);
    }
    if (value < series.minValue || value > series.maxValue) {
      throw new Error(
        `EIA WPSR ${series.sourceSeriesKey}：第 ${index + 1} 行 ${value} 超出 [${series.minValue}, ${series.maxValue}]`,
      );
    }
    if (obsDate.getTime() <= previousTime) {
      throw new Error(`EIA WPSR ${series.sourceSeriesKey}：日期未严格递增（${isoDay(obsDate)}）`);
    }
    if (obsDate.getUTCDay() !== 5) {
      throw new Error(`EIA WPSR ${series.sourceSeriesKey}：周度观测日不是周五（${isoDay(obsDate)}）`);
    }
    const futureLimit = Date.now() + 14 * 86_400_000;
    if (obsDate.getTime() > futureLimit) {
      throw new Error(`EIA WPSR ${series.sourceSeriesKey}：出现异常未来日期 ${isoDay(obsDate)}`);
    }
    previousTime = obsDate.getTime();
    points.push({ obsDate, value });
  }

  if (points.length === 0) {
    throw new Error(`EIA WPSR ${series.sourceSeriesKey}：解析后 0 个有效点`);
  }

  const contentsRows = XLSX.utils.sheet_to_json<unknown[]>(contentsSheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  const summaryRow = contentsRows.find((row) => row[0] === DATA_SHEET);
  if (!summaryRow || summaryRow[2] !== 1 || summaryRow[3] !== "Weekly") {
    throw new Error(`EIA WPSR ${series.sourceSeriesKey}：Contents 的 Data 1 摘要异常`);
  }
  const declaredLatest = parseUsDate(summaryRow[4]);
  const latestObsDate = points[points.length - 1]!.obsDate;
  if (declaredLatest.getTime() !== latestObsDate.getTime()) {
    throw new Error(
      `EIA WPSR ${series.sourceSeriesKey}：Contents 最新日 ${isoDay(declaredLatest)} 与数据末行 ${isoDay(latestObsDate)} 不一致`,
    );
  }

  return { points, latestObsDate, skippedInvalid: 0 };
}
