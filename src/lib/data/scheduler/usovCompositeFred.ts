/** usov 复合 FRED 序列（多序列拉取后在 worker 内计算） */
export type UsovCompositeSpec =
  | { kind: "spread"; a: string; b: string }
  | { kind: "ratio"; num: string; den: string }
  | { kind: "wow_pct"; series: string }
  | { kind: "wow_ma4"; series: string };

/**
 * 宏观数据库约束：库内不存二次计算指标。原 c04/c12/c25/c26/c27 复合已退役，
 * 改在模板「指标运算」中实现（见 retiredIndicators.ts）。勿再新增。
 */
export const USOV_COMPOSITE_FRED: Record<string, UsovCompositeSpec> = {};

export function usovCompositeSpec(instrumentCode: string): UsovCompositeSpec | null {
  return USOV_COMPOSITE_FRED[instrumentCode] ?? null;
}
