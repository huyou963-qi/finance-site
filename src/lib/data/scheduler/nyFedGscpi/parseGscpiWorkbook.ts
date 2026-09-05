import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";

/**
 * 解析 NY Fed `gscpi_data.xlsx` 的 "GSCPI Monthly Data" sheet → 月度观测点。
 *
 * 结构（2026-09 fixture 核实，见 .data/nyfed-gscpi-sample.xlsx）：
 *   sheet "GSCPI Monthly Data"，前若干行为落款/元信息噪声，表头行两列
 *   "Date" | "GSCPI"（表头行位置不固定，用内容定位而非固定行号）；
 *   数据行：Date 为文本 "DD-Mon-YYYY"（如 "31-Jan-1998"，非 Excel 日期序列号，
 *   与 nyFedRecession/allmonth.xls 不同，无需 SSF.parse_date_code），值为月末观测日，
 *   归一到月首 `obsDate = YYYY-MM-01` 与库内月频序列对齐；
 *   GSCPI 为标准化指数（0 为历史均值，单位标准差），无需单位换算，源自带高精度浮点，
 *   四舍五入保留 4 位小数去除计算尾噪。
 *
 * 防御：sheet/表头缺失、0 有效点、日期解析失败、指数越出合理区间 [-10, 10]
 *      一律 throw 或跳过计入 skippedInvalid，绝不写入可疑值（源站改版时报错而非静默取错）。
 */

const SHEET_NAME = "GSCPI Monthly Data";
const DATE_COL_HEADER = "Date";
const VALUE_COL_HEADER = "GSCPI";
const MIN_VALUE = -10;
const MAX_VALUE = 10;

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export type ParsedGscpi = {
  points: ObservationPoint[];
  latestObsDate: Date | null;
  skippedInvalid: number;
};

function parseDateCell(text: unknown): { y: number; m: number } | null {
  if (typeof text !== "string") return null;
  const m = /^(\d{1,2})-([A-Za-z]{3})[a-z]*-(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const mon = MONTH_MAP[m[2]!.toLowerCase()];
  const year = Number(m[3]);
  if (!mon || !Number.isFinite(year)) return null;
  return { y: year, m: mon };
}

export function parseGscpiWorkbook(wb: XLSX.WorkBook): ParsedGscpi {
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) {
    throw new Error(
      `GSCPI：缺 sheet "${SHEET_NAME}"（实际：${wb.SheetNames.join(",")}；源结构可能已变）`,
    );
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
  });

  const headerIdx = rows.findIndex(
    (row) => row[0] === DATE_COL_HEADER && row[1] === VALUE_COL_HEADER,
  );
  if (headerIdx < 0) {
    throw new Error(
      `GSCPI：未找到含 "${DATE_COL_HEADER}"/"${VALUE_COL_HEADER}" 的表头行（源结构可能已变）`,
    );
  }

  const points: ObservationPoint[] = [];
  let latest: Date | null = null;
  let skippedInvalid = 0;
  const seenMonths = new Set<string>();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]!;
    const rawDate = row[0];
    if (rawDate == null || rawDate === "") continue; // 表尾空行，正常跳过
    const ymd = parseDateCell(rawDate);
    const rawValue = row[1];
    const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
    if (!ymd || !Number.isFinite(value)) {
      skippedInvalid += 1;
      continue;
    }
    if (value < MIN_VALUE || value > MAX_VALUE) {
      skippedInvalid += 1;
      continue;
    }
    const key = `${ymd.y}-${ymd.m}`;
    if (seenMonths.has(key)) continue; // 同月重复行，只取先遇到的一条
    seenMonths.add(key);

    const obsDate = new Date(Date.UTC(ymd.y, ymd.m - 1, 1));
    const now = new Date();
    if (obsDate.getTime() > Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) {
      skippedInvalid += 1; // 未来日期异常，跳过而非静默写入
      continue;
    }
    points.push({ obsDate, value: Math.round(value * 10_000) / 10_000 });
    if (!latest || obsDate > latest) latest = obsDate;
  }

  if (points.length === 0) {
    throw new Error("GSCPI：解析后 0 个有效点（结构或数值异常）");
  }
  points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  return { points, latestObsDate: latest, skippedInvalid };
}
