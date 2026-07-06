import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";

/**
 * 解析 NY Fed allmonth.xls 的 rec_prob sheet → 衰退概率观测点。
 *
 * 结构（2026-07 fixture 核实，见 .data/nyfed-allmonth-sample.xls）：
 *   sheet "rec_prob"，列：Date | 10 Year Treasury Yield | 3 Month Treasury Yield |
 *   3 Month Treasury Yield (Bond Equivalent Basis) | Spread | Rec_prob | NBER_Rec
 *   - Date 为 Excel 序列号（用 SSF.parse_date_code 确定性转换，避开时区）
 *   - Rec_prob 为分数（0.1498 = 14.98%）；早期行为空、末段为 12 个月前瞻预测（有 prob 无收益率）
 *
 * 防御：sheet/列缺失、0 有效点、概率越界一律 throw，让 fetch_run 记 FAILED 触发告警，
 *      绝不写入可疑值（源站改版时报错而非静默取错）。
 */

const SHEET_NAME = "rec_prob";
const DATE_COL = "Date";
const PROB_COL = "Rec_prob";

export type ParsedRecProb = {
  /** value = 概率百分比（分数×100，两位小数）；obsDate 归一到月首，与库内月频对齐 */
  points: ObservationPoint[];
  latestObsDate: Date | null;
  skippedInvalid: number;
};

export function parseRecProbWorkbook(wb: XLSX.WorkBook): ParsedRecProb {
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) {
    throw new Error(
      `NY Fed 衰退概率：缺 sheet "${SHEET_NAME}"（实际：${wb.SheetNames.join(",")}；源结构可能已变）`,
    );
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    raw: true,
    defval: null,
  });
  if (rows.length === 0) {
    throw new Error("NY Fed 衰退概率：sheet 无数据行");
  }
  const cols = Object.keys(rows[0]!);
  if (!cols.includes(DATE_COL) || !cols.includes(PROB_COL)) {
    throw new Error(
      `NY Fed 衰退概率：缺列 ${DATE_COL}/${PROB_COL}（实际列：${cols.join(",")}）`,
    );
  }

  const points: ObservationPoint[] = [];
  let latest: Date | null = null;
  let skippedInvalid = 0;

  for (const r of rows) {
    const rawProb = r[PROB_COL];
    if (rawProb == null || rawProb === "") continue; // 早期/无预测行，正常跳过
    const prob = typeof rawProb === "number" ? rawProb : Number(rawProb);
    // 源为分数；容忍浮点误差到 1.0001
    if (!Number.isFinite(prob) || prob < 0 || prob > 1.0001) {
      skippedInvalid += 1;
      continue;
    }
    const rawDate = r[DATE_COL];
    const serial = typeof rawDate === "number" ? rawDate : Number(rawDate);
    if (!Number.isFinite(serial) || serial <= 0) {
      skippedInvalid += 1;
      continue;
    }
    const dc = XLSX.SSF.parse_date_code(serial);
    if (!dc || !dc.y || !dc.m) {
      skippedInvalid += 1;
      continue;
    }
    // 归一到月首（源为月末日）→ 与 CPI/monetary 等月频序列 YYYY-MM-01 对齐
    const obsDate = new Date(Date.UTC(dc.y, dc.m - 1, 1));
    const value = Math.round(prob * 100 * 100) / 100; // 分数 → 百分比，两位小数
    points.push({ obsDate, value });
    if (!latest || obsDate > latest) latest = obsDate;
  }

  if (points.length === 0) {
    throw new Error("NY Fed 衰退概率：解析后 0 个有效点（结构或数值异常）");
  }
  points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  return { points, latestObsDate: latest, skippedInvalid };
}
