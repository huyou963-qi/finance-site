export const FRENCH_URL = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html";
export const WIKI_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies";
export const WIKI_HISTORY_URL = "https://en.wikipedia.org/wiki/Historical_components_of_the_S%26P_500";
export const MARKET_INTERNALS_SERIES = [
  { code: "ff_us_smb_daily", key: "SMB", name: "美国风格：小盘减大盘（SMB）", group: "美股风格因子", source: "french", unit: "%", note: "五因子版本SMB；日度多空收益差，源方通常按月更新日频文件" },
  { code: "ff_us_hml_daily", key: "HML", name: "美国风格：价值减成长（HML）", group: "美股风格因子", source: "french", unit: "%", note: "高账面市值比减低账面市值比；日度多空收益差" },
  { code: "ff_us_rmw_daily", key: "RMW", name: "美国风格：强盈利减弱盈利（RMW）", group: "美股风格因子", source: "french", unit: "%", note: "经营盈利能力因子，不等同完整质量因子" },
  { code: "ff_us_cma_daily", key: "CMA", name: "美国风格：保守投资减激进投资（CMA）", group: "美股风格因子", source: "french", unit: "%", note: "公司资产投资风格，不是仓位风险偏好" },
  { code: "ff_us_mom_daily", key: "Mom", name: "美国风格：赢家减输家（动量）", group: "美股风格因子", source: "french", unit: "%", note: "官方日度动量因子；不是月度值填充" },
  { code: "breadth_us_sp500_above50_daily", key: "above50", name: "标普500广度：站上50日均线占比", group: "美股市场广度", source: "breadth", unit: "%", note: "公开变更重建每日成分；连续50个交易日价格；覆盖率至少95%才发布，非官方PIT" },
  { code: "breadth_us_sp500_above200_daily", key: "above200", name: "标普500广度：站上200日均线占比", group: "美股市场广度", source: "breadth", unit: "%", note: "公开变更重建每日成分；连续200个交易日价格；覆盖率至少95%才发布，非官方PIT" },
  { code: "breadth_us_sp500_coverage50_daily", key: "coverage50", name: "标普500广度：50日样本覆盖率", group: "美股市场广度", source: "breadth", unit: "%", note: "有连续50日有效价格的成员数/当日重建名单数；覆盖率不证明名单无偏" },
  { code: "breadth_us_sp500_coverage200_daily", key: "coverage200", name: "标普500广度：200日样本覆盖率", group: "美股市场广度", source: "breadth", unit: "%", note: "有连续200日有效价格的成员数/当日重建名单数；覆盖率不证明名单无偏" },
] as const;
export const MARKET_INTERNALS_RULE = { type: "probe_interval" as const, intervalHours: 24 };
