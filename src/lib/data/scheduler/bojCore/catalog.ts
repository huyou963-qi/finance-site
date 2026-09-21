/**
 * BOJ core financial series, verified against the official API metadata on
 * 2026-09-14. Flow-of-funds stocks contain an official 2004Q4/2005Q1 SNA
 * methodology break; do not smooth or splice that break.
 */

export const JP_BOJ_FLOW_OF_FUNDS_PACKAGE_ID = "jp.boj.flow_of_funds_core";
export const JP_BOJ_CALL_RATE_PACKAGE_ID = "jp.boj.call_rate_monthly";
export const JP_BOJ_FX_PACKAGE_ID = "jp.boj.foreign_exchange_monthly";
export const JP_BOJ_ACCOUNTS_PACKAGE_ID = "jp.boj.accounts_monthly";

/** 2026Q2 preliminary FOF release: 2026-09-17 08:50 JST / 07:50 HKT. */
export const JP_BOJ_FOF_NEXT_OFFICIAL_RELEASE_AT = "2026-09-16T23:50:00.000Z";
/**
 * BOJ's announcement clock can precede API availability by a few minutes.
 * Fetch after a small fixed buffer rather than recording a spurious HTTP 400
 * and falling into the worker's much longer failure backoff.
 */
export const JP_BOJ_FOF_NEXT_FETCH_AT = "2026-09-17T00:05:00.000Z";

type Category =
  | "货币政策与流动性"
  | "金融条件与银行"
  | "财政与公共债务"
  | "利率与信用市场"
  | "对外与汇率";

type SeriesInput = {
  db: "FF" | "FM02" | "FM08" | "BS01";
  seriesCode: string;
  key: string;
  instrumentCode: string;
  displayName: string;
  category: Category;
  subgroup: string;
  sourceName: string;
  notes: string;
  startPeriod: string;
  releasePackageId: string;
};

function quarterly(row: SeriesInput) {
  return {
    ...row,
    frequency: "QUARTERLY" as const,
    freqLabel: "季度" as const,
    unit: "亿日元" as const,
    sourceUnit: "100 million yen" as const,
    probeIntervalHours: 168 as const,
  };
}

function monthly(
  row: SeriesInput & { unit: string; sourceUnit: string },
) {
  return {
    ...row,
    frequency: "MONTHLY" as const,
    freqLabel: "月" as const,
    probeIntervalHours: 24 as const,
  };
}

const SNA_BREAK =
  "1997Q4起；2004Q4及以前采用1993SNA，2005Q1起采用2008SNA，官方元数据明确标示方法断点。";

export const JP_BOJ_CORE_SERIES = [
  quarterly({
    db: "FF",
    seriesCode: "FOF_FFAS430A900",
    key: "household_financial_assets",
    instrumentCode: "boj_jp_fof_household_financial_assets",
    displayName: "日本：资金循环：居民金融资产总额",
    category: "金融条件与银行",
    subgroup: "资金循环：居民资产负债表",
    sourceName: "Assets/Total/Households/Stock",
    notes: `${SNA_BREAK} 养老金权益编制方法变化使断点更明显。`,
    startPeriod: "199704",
    releasePackageId: JP_BOJ_FLOW_OF_FUNDS_PACKAGE_ID,
  }),
  quarterly({
    db: "FF",
    seriesCode: "FOF_FFAS430A100",
    key: "household_currency_deposits",
    instrumentCode: "boj_jp_fof_household_currency_deposits",
    displayName: "日本：资金循环：居民现金及存款",
    category: "金融条件与银行",
    subgroup: "资金循环：居民资产负债表",
    sourceName: "Assets/Currency and deposits/Households/Stock",
    notes: SNA_BREAK,
    startPeriod: "199704",
    releasePackageId: JP_BOJ_FLOW_OF_FUNDS_PACKAGE_ID,
  }),
  quarterly({
    db: "FF",
    seriesCode: "FOF_FFAS430A334",
    key: "household_equity_investment_funds",
    instrumentCode: "boj_jp_fof_household_equity_investment_fund_shares",
    displayName: "日本：资金循环：居民股票及投资基金份额",
    category: "金融条件与银行",
    subgroup: "资金循环：居民资产负债表",
    sourceName: "Assets/Equity and investment fund shares/Households/Stock",
    notes:
      "官方直接发布的合计基础序列，不由本站相加；2004Q4及以前为股票及其他权益加投资信托受益凭证，2005Q1起采用2008SNA，存在断点。",
    startPeriod: "199704",
    releasePackageId: JP_BOJ_FLOW_OF_FUNDS_PACKAGE_ID,
  }),
  quarterly({
    db: "FF",
    seriesCode: "FOF_FFAS410L900",
    key: "nonfinancial_corporations_liabilities",
    instrumentCode: "boj_jp_fof_nonfinancial_corporations_financial_liabilities",
    displayName: "日本：资金循环：非金融企业金融负债总额",
    category: "金融条件与银行",
    subgroup: "资金循环：非金融企业",
    sourceName: "Liabilities/Total/Nonfinancial corporations/Stock",
    notes: `${SNA_BREAK} 再投资收益编制方法变化使断点更明显。`,
    startPeriod: "199704",
    releasePackageId: JP_BOJ_FLOW_OF_FUNDS_PACKAGE_ID,
  }),
  quarterly({
    db: "FF",
    seriesCode: "FOF_FFAS410L200",
    key: "nonfinancial_corporations_loans",
    instrumentCode: "boj_jp_fof_nonfinancial_corporations_loan_liabilities",
    displayName: "日本：资金循环：非金融企业贷款负债",
    category: "金融条件与银行",
    subgroup: "资金循环：非金融企业",
    sourceName: "Liabilities/Loans/Nonfinancial corporations/Stock",
    notes: SNA_BREAK,
    startPeriod: "199704",
    releasePackageId: JP_BOJ_FLOW_OF_FUNDS_PACKAGE_ID,
  }),
  quarterly({
    db: "FF",
    seriesCode: "FOF_FFAS420L300",
    key: "general_government_debt_securities",
    instrumentCode: "boj_jp_fof_general_government_debt_securities",
    displayName: "日本：资金循环：一般政府债务证券负债",
    category: "财政与公共债务",
    subgroup: "资金循环：一般政府",
    sourceName: "Liabilities/Debt securities/General government/Stock",
    notes:
      "官方直接发布的一般政府部门债务证券负债存量；2004Q4及以前按证券（不含股票）减投资信托受益凭证计算，2005Q1起采用2008SNA。",
    startPeriod: "199704",
    releasePackageId: JP_BOJ_FLOW_OF_FUNDS_PACKAGE_ID,
  }),
  quarterly({
    db: "FF",
    seriesCode: "FOF_FFAS420L700",
    key: "general_government_net_financial_position",
    instrumentCode: "boj_jp_fof_general_government_net_financial_position",
    displayName: "日本：资金循环：一般政府金融资产负债差额",
    category: "财政与公共债务",
    subgroup: "资金循环：一般政府",
    sourceName:
      "Liabilities/Difference between financial assets and liabilities/General government/Stock",
    notes: `${SNA_BREAK} 保留BOJ公布的带符号差额，不在本站以资产和负债相减。`,
    startPeriod: "199704",
    releasePackageId: JP_BOJ_FLOW_OF_FUNDS_PACKAGE_ID,
  }),
  quarterly({
    db: "FF",
    seriesCode: "FOF_FFAS500L700",
    key: "overseas_net_position",
    instrumentCode: "boj_jp_fof_overseas_net_financial_position",
    displayName: "日本：资金循环：海外部门对日金融净头寸",
    category: "对外与汇率",
    subgroup: "资金循环：海外部门",
    sourceName:
      "Liabilities/Difference between financial assets and liabilities/Overseas/Stock",
    notes: `${SNA_BREAK} 保留BOJ海外部门视角的带符号差额；不能与日本净国际投资头寸直接混同。`,
    startPeriod: "199704",
    releasePackageId: JP_BOJ_FLOW_OF_FUNDS_PACKAGE_ID,
  }),
  monthly({
    db: "FM02",
    seriesCode: "STRACLUCON",
    key: "uncollateralized_overnight_call_rate",
    instrumentCode: "boj_jp_uncollateralized_overnight_call_rate_monthly_average",
    displayName: "日本：无担保隔夜拆借利率（月均，政策操作目标代理）",
    category: "利率与信用市场",
    subgroup: "政策利率与短端利率",
    sourceName: "Call Rate, Uncollateralized Overnight/Average",
    notes:
      "这是BOJ直接发布的市场成交利率月均值，不是各次会议声明中的目标值。因政策框架跨期变化，BOJ API没有一条可无断点代表历次政策设定的单一序列，故用该操作目标对应市场利率作为可持续基础事实。",
    startPeriod: "198507",
    releasePackageId: JP_BOJ_CALL_RATE_PACKAGE_ID,
    unit: "%",
    sourceUnit: "percent per annum",
  }),
  monthly({
    db: "FM08",
    seriesCode: "FXERM07",
    key: "usd_jpy_monthly_average",
    instrumentCode: "boj_jp_usd_jpy_monthly_average",
    displayName: "日本：美元兑日元即期汇率（月均，东京市场17时）",
    category: "对外与汇率",
    subgroup: "汇率",
    sourceName:
      "US.Dollar/Yen Spot Rate at 17:00 in JST, Average in the Month, Tokyo Market",
    notes: "东京外汇市场银行间即期汇率17时月平均；报价为每美元日元数。",
    startPeriod: "197301",
    releasePackageId: JP_BOJ_FX_PACKAGE_ID,
    unit: "日元/美元",
    sourceUnit: "Yen per U.S. Dollar",
  }),
  // 日本银行勘定（BS01，月末）：取代 Japan_Overview xlsx 的按旬 c19/c20（2026-05 后停更）。
  // 2026-09 实测：持有日本政府证券月末值与 xlsx 3/31 旬末值逐值相同（530.87 万亿日元）；
  // 资产总额月末结算值比旬报高约 0.1%（663.03 vs 662.13），口径为正式月末账目。
  monthly({
    db: "BS01",
    seriesCode: "MABJMTA",
    key: "boj_accounts_total_assets",
    instrumentCode: "boj_jp_accounts_total_assets",
    displayName: "日本银行：资产总额（月末）",
    category: "货币政策与流动性",
    subgroup: "央行资产负债表",
    sourceName: "Bank of Japan Accounts/Assets/Total (Assets, or Liabilities and Net Assets) (s)",
    notes: "日本银行勘定月末余额（BS01），1998-04 起；不含按旬营业报告的旬末值。",
    startPeriod: "199804",
    releasePackageId: JP_BOJ_ACCOUNTS_PACKAGE_ID,
    unit: "亿日元",
    sourceUnit: "100 million yen",
  }),
  monthly({
    db: "BS01",
    seriesCode: "MABJMA5",
    key: "boj_accounts_jgs_holdings",
    instrumentCode: "boj_jp_accounts_jgs_holdings",
    displayName: "日本银行：持有日本政府证券（月末）",
    category: "货币政策与流动性",
    subgroup: "央行资产负债表",
    sourceName: "Bank of Japan Accounts/Assets/Japanese Government Securities (f)",
    notes: "日本银行勘定资产项「日本政府证券」月末余额（含国债与短期国库券），1998-04 起。",
    startPeriod: "199804",
    releasePackageId: JP_BOJ_ACCOUNTS_PACKAGE_ID,
    unit: "亿日元",
    sourceUnit: "100 million yen",
  }),
] as const;

export const JP_BOJ_FLOW_OF_FUNDS_SERIES = JP_BOJ_CORE_SERIES.filter(
  (row) => row.db === "FF",
);

export type JpBojCoreSeries = (typeof JP_BOJ_CORE_SERIES)[number];

export function findJpBojCoreSeries(instrumentCode: string) {
  return JP_BOJ_CORE_SERIES.find((row) => row.instrumentCode === instrumentCode);
}
