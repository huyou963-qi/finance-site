import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";
import { RITTER_IPO_SERIES, type RitterIpoSeriesKey } from "./catalog";

const SHEET_NAME = "IPOALL";

/**
 * 源文件里表示"该列此月无值"的已知字符串（小写比较）。
 * - "see 1975"/"see 1980" 标记该分项的起始年份，"."/"na" 标记个别缺月；
 * - "spac ipos"/"n"/"first-day returns" 是 2019-08/2019-09 两行 col13/col14 里的
 *   **行内表头**——那两行本身是合法数据行，标签串必须在此登记，否则会被误报为源改版。
 * 这几种以外的非数字内容会计入 skippedInvalid 而不是静默跳过——源改版时能从日志看见。
 */
const KNOWN_SENTINELS = new Set([
  "see 1975",
  "see 1980",
  ".",
  "na",
  "n/a",
  "spac ipos",
  "n",
  "first-day returns",
]);

/** 数据覆盖 1960–2025，两位数年份 60–99 → 19xx，0–59 → 20xx（见 catalog.ts 陷阱 2） */
const TWO_DIGIT_YEAR_PIVOT = 60;
const EARLIEST_PLAUSIBLE_YEAR = 1960;

export type ParsedRitterIpo = {
  pointsBySeries: Map<RitterIpoSeriesKey, ObservationPoint[]>;
  latestObsDateBySeries: Map<RitterIpoSeriesKey, Date>;
  skippedInvalid: number;
};

function resolveYear(raw: number, maxYear: number): number | null {
  if (!Number.isInteger(raw)) return null;
  const year = raw >= 100 ? raw : raw >= TWO_DIGIT_YEAR_PIVOT ? 1900 + raw : 2000 + raw;
  if (year < EARLIEST_PLAUSIBLE_YEAR || year > maxYear) return null;
  return year;
}

/**
 * 解析 Ritter `IPOALL.xlsx` 的 IPOALL sheet → 四条月度分项。
 *
 * 该文件**没有表头行**（列含义只在末尾脚注里），因此按"col0 是 1..12 的月份 +
 * col1 是可信年份"锚定数据行，天然把文件末尾的脚注文字行排除在外。
 * 每列起始年份不同且用字符串哨兵占位，故逐列独立判断（详见 catalog.ts 注释）。
 */
export function parseRitterIpoAll(wb: XLSX.WorkBook): ParsedRitterIpo {
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) {
    throw new Error(
      `Ritter IPOALL：缺 sheet "${SHEET_NAME}"（实际：${wb.SheetNames.join(",")}；源结构可能已变）`,
    );
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
  });

  const pointsBySeries = new Map<RitterIpoSeriesKey, ObservationPoint[]>();
  const latestObsDateBySeries = new Map<RitterIpoSeriesKey, Date>();
  for (const s of RITTER_IPO_SERIES) pointsBySeries.set(s.seriesKey, []);

  const seenMonths = new Set<string>();
  let skippedInvalid = 0;
  let dataRowCount = 0;
  const now = new Date();
  const maxYear = now.getUTCFullYear() + 1;
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  for (const row of rows) {
    const rawMonth = row[0];
    const rawYear = row[1];
    // 锚定条件：月份 1..12 且年份可解析。脚注行（col0 是文字）在此天然出局。
    if (typeof rawMonth !== "number" || typeof rawYear !== "number") continue;
    if (!Number.isInteger(rawMonth) || rawMonth < 1 || rawMonth > 12) continue;
    const year = resolveYear(rawYear, maxYear);
    if (year === null) {
      skippedInvalid += 1;
      continue;
    }
    dataRowCount += 1;

    const monthKey = `${year}-${rawMonth}`;
    if (seenMonths.has(monthKey)) continue; // 同月重复行只取先遇到的一条
    seenMonths.add(monthKey);

    const obsDate = new Date(Date.UTC(year, rawMonth - 1, 1));
    if (obsDate.getTime() > todayUtc) {
      skippedInvalid += 1;
      continue;
    }

    for (const series of RITTER_IPO_SERIES) {
      const raw = row[series.columnIndex];
      // 留空 / 整行短于该列（窄表里尾部单元格是 undefined 而非 null）都算"此月无值"，
      // 不是异常——否则可选列缺席会把 skippedInvalid 刷成一堆假阳性
      if (raw === null || raw === undefined || raw === "") continue;
      if (typeof raw === "string") {
        // 已知哨兵静默跳过；未知文字计入 skippedInvalid 以便发现源改版
        if (!KNOWN_SENTINELS.has(raw.trim().toLowerCase())) skippedInvalid += 1;
        continue;
      }
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        skippedInvalid += 1;
        continue;
      }
      // 换算后再做值域校验——valueRange 描述的是入库值，不是源值
      const value = series.scaleBy ? raw * series.scaleBy : raw;
      const [lo, hi] = series.valueRange;
      if (value < lo || value > hi) {
        skippedInvalid += 1;
        continue;
      }
      pointsBySeries.get(series.seriesKey)!.push({ obsDate, value });
      const prevLatest = latestObsDateBySeries.get(series.seriesKey);
      if (!prevLatest || obsDate > prevLatest) {
        latestObsDateBySeries.set(series.seriesKey, obsDate);
      }
    }
  }

  if (dataRowCount === 0) {
    throw new Error("Ritter IPOALL：未识别到任何数据行（源结构可能已变，如改用四位年份或加了表头）");
  }
  for (const series of RITTER_IPO_SERIES) {
    const points = pointsBySeries.get(series.seriesKey)!;
    // 核心分项 0 点 → 报错；SPAC 等可选分项被源撤掉时放行，交给 verify 的
    // MIN_COUNT 在监控层报警，避免附加统计消失连累核心序列同步（见 catalog.ts）
    if (points.length === 0 && !series.optional) {
      throw new Error(
        `Ritter IPOALL：分项 ${series.seriesKey} 解析后 0 个有效点（列序或数值异常）`,
      );
    }
    points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  }

  return { pointsBySeries, latestObsDateBySeries, skippedInvalid };
}
