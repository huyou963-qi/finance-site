import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";

/**
 * 解析 Damodaran histimpl.xls 的 "Historical Impl Premiums" sheet → 隐含 ERP 年度观测点。
 *
 * 结构（2026-09 fixture 核实，见 .data/damodaran-histimpl-sample.xls）：
 *   sheet "Historical Impl Premiums"，前 6 行为标题/元信息，第 7 行（0-based index 6）
 *   起为表头：Year | Earnings Yield | Dividend Yield | S&P 500 | Earnings* | Dividends* |
 *   Dividends + Buybacks | Change in Earnings | Change in Dividends | T.Bill Rate |
 *   T.Bond Rate | Bond-Bill | Smoothed Growth | Implied Premium (DDM) |
 *   Analyst Growth Estimate | Implied ERP (FCFE) | Implied ERP with risk adjusted
 *   riskfree rate | Implied Premium (FCFE with sustainable Payout) | ERP/Riskfree Rate
 *   - 数据行 Year=1960..最新年，1960 首年无 ERP（基期，值为空，正常跳过）
 *   - 数据行之后为空行 + 脚注文字 + "Period/ERP/ERP+Riskfree Rate" 汇总表，一律忽略
 *   - Implied ERP (FCFE) 为小数（0.0423 = 4.23%），年度快照口径为年末（即年底 S&P 500 隐含值）
 *
 * 防御：sheet/表头缺失、0 有效点、ERP 越界一律 throw，让 fetch_run 记 FAILED 触发告警，
 *      绝不写入可疑值（源站改版时报错而非静默取错）。
 */

const SHEET_NAME = "Historical Impl Premiums";
const YEAR_COL = "Year";
const ERP_COL = "Implied ERP (FCFE)";
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

export type ParsedHistImpl = {
  /** value = 隐含 ERP 百分比（小数×100，两位小数）；obsDate 归一到年末 */
  points: ObservationPoint[];
  latestObsDate: Date | null;
  skippedInvalid: number;
};

export function parseHistImplWorkbook(wb: XLSX.WorkBook): ParsedHistImpl {
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) {
    throw new Error(
      `Damodaran ERP：缺 sheet "${SHEET_NAME}"（实际：${wb.SheetNames.join(",")}；源结构可能已变）`,
    );
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
  });

  const headerIdx = rows.findIndex(
    (row) => row[0] === YEAR_COL && row.includes(ERP_COL),
  );
  if (headerIdx < 0) {
    throw new Error(
      `Damodaran ERP：未找到含 "${YEAR_COL}"/"${ERP_COL}" 的表头行（源结构可能已变）`,
    );
  }
  const header = rows[headerIdx]!;
  const yearIdx = header.indexOf(YEAR_COL);
  const erpIdx = header.indexOf(ERP_COL);

  const points: ObservationPoint[] = [];
  let latest: Date | null = null;
  let skippedInvalid = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]!;
    const rawYear = row[yearIdx];
    if (rawYear == null || rawYear === "") continue; // 数据表结束后的脚注/汇总行
    const year = typeof rawYear === "number" ? rawYear : Number(rawYear);
    if (!Number.isFinite(year) || year < MIN_YEAR || year > MAX_YEAR) continue; // 非年份行

    const rawErp = row[erpIdx];
    if (rawErp == null || rawErp === "") continue; // 首年（1960）无 ERP，正常跳过
    const erp = typeof rawErp === "number" ? rawErp : Number(rawErp);
    if (!Number.isFinite(erp) || erp < 0 || erp > 0.5) {
      skippedInvalid += 1;
      continue;
    }
    const obsDate = new Date(Date.UTC(year, 11, 31));
    const value = Math.round(erp * 100 * 100) / 100; // 小数 → 百分比，两位小数
    points.push({ obsDate, value });
    if (!latest || obsDate > latest) latest = obsDate;
  }

  if (points.length === 0) {
    throw new Error("Damodaran ERP：解析后 0 个有效点（结构或数值异常）");
  }
  points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  return { points, latestObsDate: latest, skippedInvalid };
}
