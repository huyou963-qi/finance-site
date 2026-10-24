/** Correct legacy labels without rebasing, scaling, or replacing observations. */
export const AUDITED_DEFINITIONS = [
  { code: "nbs_cn_realestate_db24f54063787b44be", name: "中国：房地产：商品房待售面积：商业营业用房同比增长", unit: "%", freqLabel: "月", source: "国家统计局" },
  { code: "nbs_cn_realestate_e9a76c570b5c25c176", name: "中国：房地产：商品房待售面积：办公楼原值", unit: "万平方米", freqLabel: "月", source: "国家统计局" },
  { code: "sched_wb_PL_NV_IND_TOTL_ZS", name: "波兰：工业（含建筑业）增加值占GDP", unit: "%", freqLabel: "年", source: "World Bank" },
  { code: "sched_wb_ZA_GC_DOD_TOTL_GD_ZS", name: "南非：中央政府债务总额占GDP", unit: "%", freqLabel: "年", source: "World Bank" },
  { code: "sched_fred_RECPROUSM156N", name: "平滑衰退概率（Chauvet-Piger）", unit: "%", freqLabel: "月", source: "St. Louis Fed/FRED" },
  { code: "nbs_cn_realestate_ab8fa19959bcc39da7", name: "中国：房地产：个人按揭贷款累计值", unit: "亿元", freqLabel: "月", source: "国家统计局" },
  { code: "nbs_cn_realestate_b774bcd059b15bd9e0", name: "中国：房地产：利用外资累计值", unit: "亿元", freqLabel: "月", source: "国家统计局" },
  { code: "nbs_cn_realestate_b4f7e9914e9bc85aeb", name: "中国：房地产：商品房待售面积：办公楼同比增长", unit: "%", freqLabel: "月", source: "国家统计局" },
  { code: "usov_c23_fed_assets", name: "美联储总资产", unit: "百万美元", freqLabel: "周", source: "FRB/FRED" },
  { code: "usov_c24_fed_treasuries", name: "美联储持有美国国债", unit: "百万美元", freqLabel: "周", source: "FRB/FRED" },
  { code: "sched_wb_JP_FS_AST_DOMS_GD_ZS", name: "日本：金融部门国内信贷占GDP", unit: "%", freqLabel: "年", source: "World Bank" },
  { code: "sched_fred_UMCSENT", name: "密歇根大学消费者信心指数（官方初值/终值）", unit: "指数", freqLabel: "月", source: "University of Michigan（官方CSV）" },
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
  { code: "sched_wb_ID_FS_AST_DOMS_GD_ZS", name: "印度尼西亚：金融部门国内信贷占GDP", unit: "%", freqLabel: "年", source: "World Bank" },
] as const;

export const AUDITED_SOURCE_KEYS: Readonly<Record<string, string>> = {
  nbs_cn_realestate_db24f54063787b44be: "property|商品房待售面积：商业营业用房|yoy",
  nbs_cn_realestate_e9a76c570b5c25c176: "property|商品房待售面积：办公楼|amount",
  nbs_cn_realestate_b4f7e9914e9bc85aeb: "property|商品房待售面积：办公楼|yoy",
};

export function auditedDefinitionMetadata(previous: unknown, definition: typeof AUDITED_DEFINITIONS[number]) {
  const old = previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {};
  const sourceKey = AUDITED_SOURCE_KEYS[definition.code];
  const scrape = "scrape" in old && old.scrape && typeof old.scrape === "object" && !Array.isArray(old.scrape) ? old.scrape : {};
  return { ...old, displayName: definition.name, unit: definition.unit, freqLabel: definition.freqLabel,
    ...(sourceKey ? { scrape: { ...scrape, key: sourceKey } } : {}),
    source: definition.source, definitionAudit: ["nbs_cn_realestate_db24f54063787b44be",
      "nbs_cn_realestate_e9a76c570b5c25c176"].includes(definition.code)
      ? "2026-10-24-official-source-review" : ["sched_wb_PL_NV_IND_TOTL_ZS", "sched_wb_ZA_GC_DOD_TOTL_GD_ZS",
      "sched_fred_RECPROUSM156N", "nbs_cn_realestate_ab8fa19959bcc39da7",
      "nbs_cn_realestate_b774bcd059b15bd9e0", "nbs_cn_realestate_b4f7e9914e9bc85aeb"].includes(definition.code)
      ? "2026-10-23-official-source-review" : ["usov_c23_fed_assets", "usov_c24_fed_treasuries",
      "sched_wb_JP_FS_AST_DOMS_GD_ZS", "sched_fred_UMCSENT"].includes(definition.code)
      ? "2026-10-22-official-source-review" : definition.code === "sched_wb_ID_FS_AST_DOMS_GD_ZS"
      ? "2026-10-21-official-source-review" : "2026-10-17-official-source-review",
    ...(["sched_fred_CUSR0000SAC", "sched_fred_CUSR0000SAS"].includes(definition.code)
      ? { catalogCategory: "CPI 分项" } : {}),
  };
}
