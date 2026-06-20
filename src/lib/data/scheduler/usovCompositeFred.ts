/** usov 复合 FRED 序列（多序列拉取后在 worker 内计算） */
export type UsovCompositeSpec =
  | { kind: "spread"; a: string; b: string }
  | { kind: "ratio"; num: string; den: string }
  | { kind: "wow_pct"; series: string }
  | { kind: "wow_ma4"; series: string };

export const USOV_COMPOSITE_FRED: Record<string, UsovCompositeSpec> = {
  usov_c04_spx_gld: { kind: "ratio", num: "SP500", den: "GOLDAMGBD228NLBM" },
  usov_c12_2y_effr: { kind: "spread", a: "GS2", b: "EFFR" },
  usov_c25_fed_treasuries_wow: { kind: "wow_pct", series: "TREAST" },
  usov_c26_fed_treasuries_wow_ma4: { kind: "wow_ma4", series: "TREAST" },
  usov_c27_fed_net_liquidity: { kind: "spread", a: "WALCL", b: "TREAST" },
};

export function usovCompositeSpec(instrumentCode: string): UsovCompositeSpec | null {
  return USOV_COMPOSITE_FRED[instrumentCode] ?? null;
}
