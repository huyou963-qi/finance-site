import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";
import { NBS_CPI_COMPONENTS, NBS_CPI_MEASURES, nbsCpiCode } from "./catalog";

export type ParsedNbsCpi = { pointsByInstrument: Map<string, ObservationPoint[]>; sourceLatestObsDate: Date };
function norm(value: unknown) { return String(value ?? "").replace(/\s| /g, "").replace(/[：:、，,（）()]/g, "").replace(/^[一二三四五六七八]/, "").trim(); }
function articleMonth(value: unknown): Date | null {
  const match = /(20\d{2})年(\d{1,2})月/.exec(String(value ?? ""));
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)) : null;
}
function number(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < -50 || parsed > 200) throw new Error(`国家统计局 CPI：${label} 数值异常 ${String(value)}`);
  return parsed;
}

/**
 * 解析官方发布页「相关数据表」的 CPI sheet（.data/nbs-cpi-sample.xlsx）。
 * 标题给观测月，列 2/3 分别是环比、同比；同比指数以同比涨跌幅 + 100 精确还原。
 * 任一必需行或列缺失即失败，避免版式变化时静默写错数据。
 */
export function parseNbsCpiWorkbook(workbook: XLSX.WorkBook): ParsedNbsCpi {
  const sheet = workbook.Sheets.CPI;
  if (!sheet) throw new Error(`国家统计局 CPI：缺 sheet「CPI」（实际：${workbook.SheetNames.join(", ")}）`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  const obsDate = articleMonth(rows[0]?.[0]);
  if (!obsDate) throw new Error("国家统计局 CPI：首行未能解析发布月份");
  const header = rows.findIndex((row) => norm(row[1]).includes("环比涨跌幅") && norm(row[2]).includes("同比涨跌幅"));
  if (header < 0) throw new Error("国家统计局 CPI：未找到环比/同比表头");
  const pointsByInstrument = new Map<string, ObservationPoint[]>();
  for (const component of NBS_CPI_COMPONENTS) {
    const wanted = norm(component.workbookLabel);
    const row = rows.slice(header + 1).find((item) => {
      const label = norm(item[0]);
      return label === wanted || label === `其中${wanted}`;
    });
    if (!row) throw new Error(`国家统计局 CPI：月报缺少分项「${component.workbookLabel}」`);
    const mom = number(row[1], `${component.displayName}/环比`);
    const yoy = number(row[2], `${component.displayName}/同比`);
    pointsByInstrument.set(nbsCpiCode(component.key, "mom"), [{ obsDate, value: mom }]);
    pointsByInstrument.set(nbsCpiCode(component.key, "yoy"), [{ obsDate, value: yoy }]);
    pointsByInstrument.set(nbsCpiCode(component.key, "index"), [{ obsDate, value: yoy + 100 }]);
  }
  if (pointsByInstrument.size !== NBS_CPI_COMPONENTS.length * NBS_CPI_MEASURES.length) throw new Error("国家统计局 CPI：解析结果不完整");
  return { pointsByInstrument, sourceLatestObsDate: obsDate };
}
