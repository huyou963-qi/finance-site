/** §3.1 角色 → 默认视图（跨视图 roleId 不得重复） */
export const FISCAL_VIEW_A_ROLE_IDS = [
  "us-federal-debt-gdp",
  "us-federal-debt-total",
  "us-federal-deficit-gdp",
  "us-primary-deficit-gdp",
  "us-net-interest-gdp",
] as const;

export const FISCAL_VIEW_B_ROLE_IDS = [
  "us-receipts-individual-tax",
  "us-receipts-corporate-tax",
  "us-receipts-payroll-tax",
  "us-outlays-mandatory",
  "us-outlays-discretionary",
  "us-outlays-net-interest",
  "us-mts-receipts",
  "us-mts-outlays",
  "us-gov-consumption-yoy",
  "us-gov-investment-yoy",
] as const;

export const FISCAL_VIEW_C_ROLE_IDS = [
  "us-mts-deficit",
  "us-mts-receipts",
  "us-mts-outlays",
  "us-tga-balance",
  "us-dts-daily-deficit",
  "us-net-issuance-weekly",
] as const;

/** 视图 B/C 共享 MTS 总量角色；模板内按 calc 区分（B=yoy，C=水平/柱） */
export const FISCAL_SHARED_MTS_FLOW_ROLES = ["us-mts-receipts", "us-mts-outlays"] as const;

export function assertFiscalRoleDisjointAcrossViews(): void {
  const views = [
    ["A", FISCAL_VIEW_A_ROLE_IDS],
    ["B", FISCAL_VIEW_B_ROLE_IDS],
    ["C", FISCAL_VIEW_C_ROLE_IDS],
  ] as const;
  const seen = new Map<string, string>();
  for (const [view, ids] of views) {
    for (const id of ids) {
      if (id === "us-mts-receipts" || id === "us-mts-outlays") continue;
      const prev = seen.get(id);
      if (prev) {
        throw new Error(`财政 roleId 重复：${id} 同时出现在视图 ${prev} 与 ${view}`);
      }
      seen.set(id, view);
    }
  }
}

assertFiscalRoleDisjointAcrossViews();
