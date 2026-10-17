/** Correct legacy labels without rebasing, scaling, or replacing observations. */
export const AUDITED_DEFINITIONS = [
  { code: "sched_fred_CUSR0000SAC", name: "CPI 商品（含食品与能源商品）", unit: "指数", freqLabel: "月", source: "BLS/FRED" },
  { code: "sched_fred_CUSR0000SAS", name: "CPI 服务（含能源服务）", unit: "指数", freqLabel: "月", source: "BLS/FRED" },
  { code: "sched_fred_FGEXPND", name: "联邦政府经常性支出（季调折年）", unit: "十亿美元", freqLabel: "季", source: "BEA/FRED" },
  { code: "sched_fred_FGRECPT", name: "联邦政府经常性收入（季调折年）", unit: "十亿美元", freqLabel: "季", source: "BEA/FRED" },
  { code: "sched_fred_PNFIC1", name: "实际私人非住宅固定投资", unit: "十亿美元", freqLabel: "季", source: "BEA/FRED" },
  { code: "sched_fred_GCEC1", name: "实际政府消费支出与总投资", unit: "十亿美元", freqLabel: "季", source: "BEA/FRED" },
  { code: "sched_fred_GS2", name: "2年期美债恒定期限收益率（月均）", unit: "%", freqLabel: "月", source: "FRB H.15/FRED" },
  { code: "sched_fred_GS10", name: "10年期美债恒定期限收益率（月均）", unit: "%", freqLabel: "月", source: "FRB H.15/FRED" },
  { code: "sched_wb_MX_FS_AST_DOMS_GD_ZS", name: "墨西哥：金融部门国内信贷占GDP", unit: "%", freqLabel: "年", source: "World Bank" },
  { code: "sched_wb_ZA_FS_AST_DOMS_GD_ZS", name: "南非：金融部门国内信贷占GDP", unit: "%", freqLabel: "年", source: "World Bank" },
] as const;

export function auditedDefinitionMetadata(previous: unknown, definition: typeof AUDITED_DEFINITIONS[number]) {
  const old = previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {};
  return { ...old, displayName: definition.name, unit: definition.unit, freqLabel: definition.freqLabel,
    source: definition.source, definitionAudit: "2026-10-17-official-source-review",
    ...(["sched_fred_CUSR0000SAC", "sched_fred_CUSR0000SAS"].includes(definition.code)
      ? { catalogCategory: "CPI 分项" } : {}),
  };
}
