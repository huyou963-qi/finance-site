import type { MacroFrequencyAdjust } from "@/lib/data/macroPresetTemplates";

/**
 * 宏观序列时间轴 canonical 键（合并、排序、入库展示对齐用）：
 * - 日频：YYYY-MM-DD
 * - 月频：YYYY-MM-01（月初锚点，与 FRED/BLS 月报 obsDate 一致）
 * - 季频：YYYY-Qn
 * - 年频：YYYY
 *
 * DB `MacroObservation.obsDate` 仍为完整 Date（多为月频 1 日）；差异来自图表层 resample 曾用 YYYY-MM。
 */

export function parseMacroDateLabelToUtcMs(label: string): number | null {
  const trimmed = label.trim();
  if (/^\d{4}$/.test(trimmed)) return Date.UTC(Number(trimmed), 0, 1);
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    const y = Number(trimmed.slice(0, 4));
    const m = Number(trimmed.slice(5, 7)) - 1;
    return Date.UTC(y, m, 1);
  }
  const q = /^(\d{4})-Q([1-4])$/i.exec(trimmed);
  if (q) return Date.UTC(Number(q[1]), (Number(q[2]) - 1) * 3, 1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const y = Number(trimmed.slice(0, 4));
    const m = Number(trimmed.slice(5, 7)) - 1;
    const d = Number(trimmed.slice(8, 10));
    return Date.UTC(y, m, d);
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 将原始 obs 标签归入目标频度的 canonical 键 */
export function macroPeriodKeyFromDateLabel(
  label: string,
  target: MacroFrequencyAdjust,
): string {
  const ms = parseMacroDateLabelToUtcMs(label);
  if (ms == null) return label.trim();
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if (target === "year") return `${y}`;
  if (target === "quarter") return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  if (target === "month") return `${y}-${String(m).padStart(2, "0")}-01`;
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 合并多序列时对齐：`2026-01` 与 `2026-01-01` → `2026-01-01` */
export function macroAlignPeriodKey(label: string): string {
  const trimmed = label.trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
  return trimmed;
}

export function macroPeriodSortMs(label: string): number {
  const ms = parseMacroDateLabelToUtcMs(macroAlignPeriodKey(label));
  return ms ?? Number.NaN;
}

export function compareMacroPeriodLabels(a: string, b: string): number {
  const ta = macroPeriodSortMs(a);
  const tb = macroPeriodSortMs(b);
  if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
  if (Number.isFinite(ta)) return -1;
  if (Number.isFinite(tb)) return 1;
  return a.localeCompare(b, "zh-CN");
}

export function sortMacroPeriodLabels(labels: string[]): string[] {
  return [...labels].sort(compareMacroPeriodLabels);
}

/** 表格/图轴展示：月频锚点显示为 YYYY-MM */
export function formatMacroPeriodDisplay(label: string): string {
  const aligned = macroAlignPeriodKey(label);
  const monthAnchor = /^(\d{4})-(\d{2})-01$/.exec(aligned);
  if (monthAnchor) return `${monthAnchor[1]}-${monthAnchor[2]}`;
  return aligned;
}
