import type { DataGranularity } from "@prisma/client";

export const NFRA_BANKING_STATS_PAGE_URL =
  "https://www.nfra.gov.cn/cn/view/pages/tongjishuju/tongjishuju.html";
export const NFRA_BANKING_SYNC_SCRIPT = "scripts/data-worker/sync-nfra-banking.ts";

export const NFRA_BANKING_SOURCE = {
  id: "nfra-banking-statistics",
  agencyId: "cn-nfra",
  nameZh: "国家金融监督管理总局",
  nameEn: "National Financial Regulatory Administration",
  name: "国家金融监督管理总局银行业监管统计",
  baseUrl: NFRA_BANKING_STATS_PAGE_URL,
  websiteUrl: "https://www.nfra.gov.cn/",
} as const;

export type NfraBankingDataset =
  | "bank_assets_monthly"
  | "commercial_bank_main_quarterly";

export type NfraBankingValueKind = "amount" | "percent_fraction";

export type NfraBankingComparabilityBreak = {
  effectivePeriod: string;
  note: string;
};

/**
 * 官方工作簿脚注中的口径说明。seed/文档可直接复用这些常量，避免解析器、目录和
 * UI 各自维护一份容易漂移的口径文字。
 */
export const NFRA_BANKING_DEFINITION_NOTES = {
  bankingDomesticScope: "银行业金融机构总资产、总负债为境内口径。",
  bankingInstitutionCoverage:
    "银行业金融机构总计覆盖商业银行、政策性银行及国家开发银行、民营银行、外资银行、非银行金融机构、信托公司、理财公司等境内机构。",
  commercialBankAggregate:
    "商业银行主要监管指标为商业银行法人汇总口径；自2019年起，邮政储蓄银行纳入商业银行合计。",
  liquidityCoverageScope:
    "流动性覆盖率为资产规模在2000亿元以上的商业银行汇总数据。",
  netStableFundingScope:
    "净稳定资金比例为资产规模在2000亿元以上的商业银行汇总数据。",
  netProfitYearToDate: "净利润为本年累计值，不是单季度发生额。",
} as const;

export const NFRA_BANKING_COMPARABILITY_BREAKS = {
  bankingAssetsLiabilities: [
    {
      effectivePeriod: "2019-01",
      note: "邮政储蓄银行纳入商业银行合计和大型商业银行汇总口径；不改变银行业金融机构总计覆盖范围。",
    },
    {
      effectivePeriod: "2020-01",
      note: "金融资产投资公司纳入其他类银行业金融机构和银行业金融机构汇总口径。",
    },
    {
      effectivePeriod: "2023-01",
      note: "理财公司纳入其他类银行业金融机构和银行业金融机构汇总口径。",
    },
  ],
  commercialBankAggregate: [
    {
      effectivePeriod: "2019-Q1",
      note: "邮政储蓄银行纳入商业银行合计汇总口径。",
    },
  ],
  rmbLoanDepositRatio: [
    {
      effectivePeriod: "2016-Q1",
      note: "存贷比披露口径改为境内口径，与此前年度数据不可直接比较。",
    },
  ],
  capitalAdequacy: [
    {
      effectivePeriod: "2014-Q2",
      note: "工、农、中、建、交和招商银行等六家银行经核准开始实施资本管理高级方法，其余银行仍沿用原方法。",
    },
    {
      effectivePeriod: "2024-Q1",
      note: "《商业银行资本管理办法》施行，资本充足率相关指标改按新办法计算，与历史数据不可直接比较。",
    },
  ],
} as const satisfies Record<string, readonly NfraBankingComparabilityBreak[]>;

export type NfraBankingSeriesConfig = {
  dataset: NfraBankingDataset;
  seriesKey: string;
  provider: string;
  instrumentCode: string;
  displayName: string;
  name: string;
  freqLabel: "月" | "季度";
  granularity: DataGranularity;
  unit: "亿元" | "%";
  category:
    | "银行业资产负债"
    | "商业银行资产质量"
    | "商业银行流动性"
    | "商业银行盈利"
    | "商业银行资本充足"
    | "商业银行市场风险";
  /** 去掉缩进与脚注星号后的官方行名。 */
  sourceRowLabel: string;
  valueKind: NfraBankingValueKind;
  definitionNote: string;
  comparabilityBreaks: readonly NfraBankingComparabilityBreak[];
  /** 该行首次出现在本批官方历史工作簿的年份。 */
  availableFromYear?: number;
};

type SeriesSeed = Pick<
  NfraBankingSeriesConfig,
  | "dataset"
  | "seriesKey"
  | "displayName"
  | "freqLabel"
  | "granularity"
  | "unit"
  | "category"
  | "sourceRowLabel"
  | "valueKind"
> &
  Partial<
    Pick<
      NfraBankingSeriesConfig,
      "definitionNote" | "comparabilityBreaks" | "availableFromYear"
    >
  >;

function series(seed: SeriesSeed): NfraBankingSeriesConfig {
  const defaultDefinition =
    seed.dataset === "bank_assets_monthly"
      ? `${NFRA_BANKING_DEFINITION_NOTES.bankingDomesticScope}${NFRA_BANKING_DEFINITION_NOTES.bankingInstitutionCoverage}`
      : NFRA_BANKING_DEFINITION_NOTES.commercialBankAggregate;
  return {
    ...seed,
    provider: `nfra_banking_${seed.seriesKey}`,
    instrumentCode: `nfra_cn_${seed.seriesKey}`,
    name: seed.displayName,
    definitionNote: seed.definitionNote ?? defaultDefinition,
    comparabilityBreaks:
      seed.comparabilityBreaks ??
      (seed.dataset === "bank_assets_monthly"
        ? NFRA_BANKING_COMPARABILITY_BREAKS.bankingAssetsLiabilities
        : NFRA_BANKING_COMPARABILITY_BREAKS.commercialBankAggregate),
  };
}

const MONTHLY_COMMON = {
  dataset: "bank_assets_monthly",
  freqLabel: "月",
  granularity: "MONTHLY",
  category: "银行业资产负债",
} as const;

const QUARTERLY_COMMON = {
  dataset: "commercial_bank_main_quarterly",
  freqLabel: "季度",
  granularity: "QUARTERLY",
} as const;

const amount = "amount" as const;
const percent = "percent_fraction" as const;
const amountUnit = "亿元" as const;
const percentUnit = "%" as const;

export const NFRA_BANKING_SERIES: readonly NfraBankingSeriesConfig[] = [
  series({ ...MONTHLY_COMMON, seriesKey: "banking_total_assets", displayName: "银行业金融机构总资产", sourceRowLabel: "总资产", valueKind: amount, unit: amountUnit }),
  series({ ...MONTHLY_COMMON, seriesKey: "banking_total_assets_yoy", displayName: "银行业金融机构总资产同比", sourceRowLabel: "总资产：比上年同期增长率", valueKind: percent, unit: percentUnit }),
  series({ ...MONTHLY_COMMON, seriesKey: "banking_total_liabilities", displayName: "银行业金融机构总负债", sourceRowLabel: "总负债", valueKind: amount, unit: amountUnit }),
  series({ ...MONTHLY_COMMON, seriesKey: "banking_total_liabilities_yoy", displayName: "银行业金融机构总负债同比", sourceRowLabel: "总负债：比上年同期增长率", valueKind: percent, unit: percentUnit }),

  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_normal_loans", displayName: "商业银行正常类贷款", sourceRowLabel: "正常类贷款", valueKind: amount, unit: amountUnit, category: "商业银行资产质量" }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_special_mention_loans", displayName: "商业银行关注类贷款", sourceRowLabel: "关注类贷款", valueKind: amount, unit: amountUnit, category: "商业银行资产质量" }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_npl_balance", displayName: "商业银行不良贷款余额", sourceRowLabel: "不良贷款余额", valueKind: amount, unit: amountUnit, category: "商业银行资产质量" }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_substandard_loans", displayName: "商业银行次级类贷款", sourceRowLabel: "其中：次级类贷款", valueKind: amount, unit: amountUnit, category: "商业银行资产质量" }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_doubtful_loans", displayName: "商业银行可疑类贷款", sourceRowLabel: "可疑类贷款", valueKind: amount, unit: amountUnit, category: "商业银行资产质量" }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_loss_loans", displayName: "商业银行损失类贷款", sourceRowLabel: "损失类贷款", valueKind: amount, unit: amountUnit, category: "商业银行资产质量" }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_normal_loan_ratio", displayName: "商业银行正常类贷款占比", sourceRowLabel: "正常类贷款占比", valueKind: percent, unit: percentUnit, category: "商业银行资产质量" }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_special_mention_loan_ratio", displayName: "商业银行关注类贷款占比", sourceRowLabel: "关注类贷款占比", valueKind: percent, unit: percentUnit, category: "商业银行资产质量" }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_npl_ratio", displayName: "商业银行不良贷款率", sourceRowLabel: "不良贷款率", valueKind: percent, unit: percentUnit, category: "商业银行资产质量" }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_substandard_loan_ratio", displayName: "商业银行次级类贷款率", sourceRowLabel: "其中：次级类贷款率", valueKind: percent, unit: percentUnit, category: "商业银行资产质量" }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_doubtful_loan_ratio", displayName: "商业银行可疑类贷款率", sourceRowLabel: "可疑类贷款率", valueKind: percent, unit: percentUnit, category: "商业银行资产质量" }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_loss_loan_ratio", displayName: "商业银行损失类贷款率", sourceRowLabel: "损失类贷款率", valueKind: percent, unit: percentUnit, category: "商业银行资产质量" }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_loan_loss_provisions", displayName: "商业银行贷款损失准备", sourceRowLabel: "贷款损失准备", valueKind: amount, unit: amountUnit, category: "商业银行资产质量" }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_provision_coverage_ratio", displayName: "商业银行拨备覆盖率", sourceRowLabel: "拨备覆盖率", valueKind: percent, unit: percentUnit, category: "商业银行资产质量" }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_loan_provision_ratio", displayName: "商业银行贷款拨备率", sourceRowLabel: "贷款拨备率", valueKind: percent, unit: percentUnit, category: "商业银行资产质量" }),

  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_liquidity_ratio", displayName: "商业银行流动性比例", sourceRowLabel: "流动性比例", valueKind: percent, unit: percentUnit, category: "商业银行流动性" }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_rmb_loan_deposit_ratio", displayName: "商业银行人民币存贷比", sourceRowLabel: "存贷比（人民币）", valueKind: percent, unit: percentUnit, category: "商业银行流动性", comparabilityBreaks: [...NFRA_BANKING_COMPARABILITY_BREAKS.commercialBankAggregate, ...NFRA_BANKING_COMPARABILITY_BREAKS.rmbLoanDepositRatio] }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_rmb_excess_reserve_ratio", displayName: "商业银行人民币超额备付金率", sourceRowLabel: "人民币超额备付金率", valueKind: percent, unit: percentUnit, category: "商业银行流动性" }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_liquidity_coverage_ratio", displayName: "商业银行流动性覆盖率", sourceRowLabel: "流动性覆盖率", valueKind: percent, unit: percentUnit, category: "商业银行流动性", definitionNote: NFRA_BANKING_DEFINITION_NOTES.liquidityCoverageScope }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_net_stable_funding_ratio", displayName: "商业银行净稳定资金比例", sourceRowLabel: "净稳定资金比例", valueKind: percent, unit: percentUnit, category: "商业银行流动性", definitionNote: NFRA_BANKING_DEFINITION_NOTES.netStableFundingScope, availableFromYear: 2024 }),

  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_net_profit_ytd", displayName: "商业银行净利润（本年累计）", sourceRowLabel: "净利润（本年累计）", valueKind: amount, unit: amountUnit, category: "商业银行盈利", definitionNote: NFRA_BANKING_DEFINITION_NOTES.netProfitYearToDate }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_return_on_assets", displayName: "商业银行资产利润率", sourceRowLabel: "资产利润率", valueKind: percent, unit: percentUnit, category: "商业银行盈利" }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_return_on_equity", displayName: "商业银行资本利润率", sourceRowLabel: "资本利润率", valueKind: percent, unit: percentUnit, category: "商业银行盈利" }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_net_interest_margin", displayName: "商业银行净息差", sourceRowLabel: "净息差", valueKind: percent, unit: percentUnit, category: "商业银行盈利" }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_non_interest_income_share", displayName: "商业银行非利息收入占比", sourceRowLabel: "非利息收入占比", valueKind: percent, unit: percentUnit, category: "商业银行盈利" }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_cost_income_ratio", displayName: "商业银行成本收入比", sourceRowLabel: "成本收入比", valueKind: percent, unit: percentUnit, category: "商业银行盈利" }),

  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_core_tier1_capital_net", displayName: "商业银行核心一级资本净额", sourceRowLabel: "核心一级资本净额", valueKind: amount, unit: amountUnit, category: "商业银行资本充足", comparabilityBreaks: [...NFRA_BANKING_COMPARABILITY_BREAKS.commercialBankAggregate, ...NFRA_BANKING_COMPARABILITY_BREAKS.capitalAdequacy] }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_tier1_capital_net", displayName: "商业银行一级资本净额", sourceRowLabel: "一级资本净额", valueKind: amount, unit: amountUnit, category: "商业银行资本充足", comparabilityBreaks: [...NFRA_BANKING_COMPARABILITY_BREAKS.commercialBankAggregate, ...NFRA_BANKING_COMPARABILITY_BREAKS.capitalAdequacy] }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_total_capital_net", displayName: "商业银行资本净额", sourceRowLabel: "资本净额", valueKind: amount, unit: amountUnit, category: "商业银行资本充足", comparabilityBreaks: [...NFRA_BANKING_COMPARABILITY_BREAKS.commercialBankAggregate, ...NFRA_BANKING_COMPARABILITY_BREAKS.capitalAdequacy] }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_credit_rwa", displayName: "商业银行信用风险加权资产", sourceRowLabel: "信用风险加权资产", valueKind: amount, unit: amountUnit, category: "商业银行资本充足", comparabilityBreaks: [...NFRA_BANKING_COMPARABILITY_BREAKS.commercialBankAggregate, ...NFRA_BANKING_COMPARABILITY_BREAKS.capitalAdequacy] }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_market_rwa", displayName: "商业银行市场风险加权资产", sourceRowLabel: "市场风险加权资产", valueKind: amount, unit: amountUnit, category: "商业银行资本充足", comparabilityBreaks: [...NFRA_BANKING_COMPARABILITY_BREAKS.commercialBankAggregate, ...NFRA_BANKING_COMPARABILITY_BREAKS.capitalAdequacy] }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_operational_rwa", displayName: "商业银行操作风险加权资产", sourceRowLabel: "操作风险加权资产", valueKind: amount, unit: amountUnit, category: "商业银行资本充足", comparabilityBreaks: [...NFRA_BANKING_COMPARABILITY_BREAKS.commercialBankAggregate, ...NFRA_BANKING_COMPARABILITY_BREAKS.capitalAdequacy] }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_floor_adjusted_total_rwa", displayName: "商业银行应用资本底线后的风险加权资产合计", sourceRowLabel: "应用资本底线后的风险加权资产合计", valueKind: amount, unit: amountUnit, category: "商业银行资本充足", comparabilityBreaks: [...NFRA_BANKING_COMPARABILITY_BREAKS.commercialBankAggregate, ...NFRA_BANKING_COMPARABILITY_BREAKS.capitalAdequacy] }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_core_tier1_capital_adequacy_ratio", displayName: "商业银行核心一级资本充足率", sourceRowLabel: "核心一级资本充足率", valueKind: percent, unit: percentUnit, category: "商业银行资本充足", comparabilityBreaks: [...NFRA_BANKING_COMPARABILITY_BREAKS.commercialBankAggregate, ...NFRA_BANKING_COMPARABILITY_BREAKS.capitalAdequacy] }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_tier1_capital_adequacy_ratio", displayName: "商业银行一级资本充足率", sourceRowLabel: "一级资本充足率", valueKind: percent, unit: percentUnit, category: "商业银行资本充足", comparabilityBreaks: [...NFRA_BANKING_COMPARABILITY_BREAKS.commercialBankAggregate, ...NFRA_BANKING_COMPARABILITY_BREAKS.capitalAdequacy] }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_capital_adequacy_ratio", displayName: "商业银行资本充足率", sourceRowLabel: "资本充足率", valueKind: percent, unit: percentUnit, category: "商业银行资本充足", comparabilityBreaks: [...NFRA_BANKING_COMPARABILITY_BREAKS.commercialBankAggregate, ...NFRA_BANKING_COMPARABILITY_BREAKS.capitalAdequacy] }),
  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_leverage_ratio", displayName: "商业银行杠杆率", sourceRowLabel: "杠杆率", valueKind: percent, unit: percentUnit, category: "商业银行资本充足", comparabilityBreaks: [...NFRA_BANKING_COMPARABILITY_BREAKS.commercialBankAggregate, ...NFRA_BANKING_COMPARABILITY_BREAKS.capitalAdequacy] }),

  series({ ...QUARTERLY_COMMON, seriesKey: "commercial_bank_cumulative_fx_exposure_ratio", displayName: "商业银行累计外汇敞口头寸比例", sourceRowLabel: "累计外汇敞口头寸比例", valueKind: percent, unit: percentUnit, category: "商业银行市场风险" }),
] as const;

export function nfraBankingSeriesByProvider(
  provider: string,
): NfraBankingSeriesConfig | null {
  return NFRA_BANKING_SERIES.find((item) => item.provider === provider) ?? null;
}
