import type { MacroDerivedCalcOp } from "@/lib/data/macroPresetTemplates";

export type MacroDerivedValueOptions = {
  leftScale?: number;
  rightScale?: number;
  scale?: number;
};

/**
 * 模板层二元指标运算。缩放只作用于显示期内的临时序列，不生成或写回数据库指标。
 */
export function applyMacroDerivedValue(
  left: number,
  right: number,
  op: MacroDerivedCalcOp,
  options: MacroDerivedValueOptions = {},
): number | null {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;

  const a = left * (options.leftScale ?? 1);
  const b = right * (options.rightScale ?? 1);
  const scale = options.scale ?? 1;
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(scale)) return null;

  if (op === "add") return (a + b) * scale;
  if (op === "sub" || op === "spread") return (a - b) * scale;
  if (op === "mul") return a * b * scale;
  if ((op === "div" || op === "ratio") && b !== 0) return (a / b) * scale;
  return null;
}
