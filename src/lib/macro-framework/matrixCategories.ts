/** 指标矩阵横向主题（按宏观分析逻辑，非严格对应 sketch 五行） */
export type MatrixCategory =
  | "activity" /** 生产与景气 */
  | "consumption" /** 消费与收入 */
  | "investment" /** 投资与住房 */
  | "labor" /** 劳动力市场 */
  | "inflation" /** 通胀 */
  | "financial" /** 金融与信贷 */
  | "external" /** 外部与贸易 */
  | "policy"; /** 财政与货币政策 */

export const MATRIX_CATEGORY_ORDER: MatrixCategory[] = [
  "activity",
  "consumption",
  "investment",
  "labor",
  "inflation",
  "financial",
  "external",
  "policy",
];

export const MATRIX_CATEGORY_LABEL: Record<MatrixCategory, string> = {
  activity: "生产与景气",
  consumption: "消费与收入",
  investment: "投资与住房",
  labor: "劳动力市场",
  inflation: "通胀",
  financial: "金融与信贷",
  external: "外部与贸易",
  policy: "政策立场",
};

export const MATRIX_CATEGORY_DESC: Record<MatrixCategory, string> = {
  activity: "产出、订单、库存与产能 — 实体经济循环",
  consumption: "零售、PCE、信心与实际购买力",
  investment: "营建、许可、成屋与私营投资 — 利率敏感",
  labor: "就业、失业、工资与劳动供给",
  inflation: "物价、通胀预期与成本压力",
  financial: "利率、信用、流动性与市场定价",
  external: "贸易、汇率与国际头寸",
  policy: "财政收支、赤字与货币政策工具",
};

/** 指标 id → 矩阵行 */
export const INDICATOR_MATRIX_CATEGORY: Record<string, MatrixCategory> = {
  // 生产与景气
  "ism-pmi": "activity",
  "ism-orders": "activity",
  "durables-ex-trans": "activity",
  "ind-prod": "activity",
  "mfg-inventories": "activity",
  "nf-output": "activity",
  "corp-profits": "activity",
  "unit-labor-cost": "activity",
  "inv-sales": "activity",
  "cap-util": "activity",
  // 消费与收入
  "michigan-sent": "consumption",
  "cb-expect": "consumption",
  pce: "consumption",
  "retail-ex-auto": "consumption",
  "real-dpi": "consumption",
  // 投资与住房
  "nonres-construct": "investment",
  "bldg-permits": "investment",
  "existing-home": "investment",
  "private-investment": "investment",
  "private-investment-stock": "investment",
  // 劳动力
  "jobless-claims": "labor",
  payrolls: "labor",
  "avg-earnings": "labor",
  unemployment: "labor",
  lfpr: "labor",
  "eci-yoy": "labor",
  // 通胀
  "core-pce": "inflation",
  "core-cpi": "inflation",
  "headline-cpi": "inflation",
  supercore: "inflation",
  "sticky-cpi": "inflation",
  "flexible-cpi": "inflation",
  "breakeven-5y": "inflation",
  "breakeven-10y": "inflation",
  "breakeven-5y5y": "inflation",
  wti: "inflation",
  // 金融与信贷
  sloos: "financial",
  "hy-oas": "financial",
  "spread-2s10": "financial",
  nfci: "financial",
  sp500: "financial",
  "ust-10y": "financial",
  dxy: "financial",
  gold: "financial",
  "ci-loans": "financial",
  "m2-yoy": "financial",
  "delinq-rate": "financial",
  "charge-off": "financial",
  "hh-net-worth": "financial",
  // 外部
  "ism-export": "external",
  "usd-broad": "external",
  "goods-trade": "external",
  "current-acct": "external",
  niip: "external",
  "terms-trade": "external",
  // 政策
  "fed-deficit-12m": "policy",
  "fed-contracts": "policy",
  "fed-expend": "policy",
  "sl-spending": "policy",
  "fed-debt-gdp": "policy",
  "primary-balance": "policy",
  "interest-rev": "policy",
  "ff-futures": "policy",
  "ust-2y": "policy",
  "eff-ffr": "policy",
  "fed-bs": "policy",
  "real-policy-rate": "policy",
};
