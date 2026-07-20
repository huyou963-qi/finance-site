/**
 * 因子注册表（Phase 1 WS1）：月频 PIT 因子快照的因子定义单一来源。
 *
 * 口径约定（详见 docs/QUANT_PHASE1_FACTORS.md）：
 * - 估值因子一律取「收益率」方向（E/P 而非 P/E）：亏损股取负值仍单调可排序（陷阱：P/E 对亏损股为 null/负）。
 * - EV/EBITDA 做不了（快照无 D&A 字段），用 OCF/EV（EV/OCF 的倒数方向）替代。
 * - `requires` 决定覆盖起点：price 因子自 2000（价格库全历史）；含 fundamental 的因子
 *   受 Q 快照 24 季回填窗口限制，实际自 ~2021 起。
 * - higherIsBetter 只是排序方向标注（供 Phase 2 screener / Phase 3 回测消费），不参与计算。
 */

export type FactorCategory =
  | "valuation"
  | "quality"
  | "growth"
  | "momentum"
  | "volatility"
  | "liquidity"
  | "size";

/** 因子所需数据面：决定覆盖率报表的分母口径 */
export type FactorDataRequirement = "price" | "fundamental" | "price+fundamental";

export type FactorDef = {
  key: string;
  nameZh: string;
  nameEn: string;
  category: FactorCategory;
  /** 排序方向：true = 值越大越「好」（多头方向） */
  higherIsBetter: boolean;
  requires: FactorDataRequirement;
  /** 数据可支撑的起始年（覆盖率报表按此分母） */
  startYear: number;
  /** 计算口径一句话（中文），细节见文档 */
  note: string;
};

export const FACTOR_DEFS: readonly FactorDef[] = [
  // ── 估值 valuation（全部为收益率方向，分母 PIT 市值） ──────────────────────
  { key: "earningsYield", nameZh: "盈利收益率", nameEn: "Earnings Yield (E/P)", category: "valuation", higherIsBetter: true, requires: "price+fundamental", startYear: 2021, note: "TTM 净利润 / PIT 市值" },
  { key: "bookYield", nameZh: "账面收益率", nameEn: "Book Yield (B/P)", category: "valuation", higherIsBetter: true, requires: "price+fundamental", startYear: 2021, note: "最新季股东权益 / PIT 市值" },
  { key: "salesYield", nameZh: "营收收益率", nameEn: "Sales Yield (S/P)", category: "valuation", higherIsBetter: true, requires: "price+fundamental", startYear: 2021, note: "TTM 营收 / PIT 市值" },
  { key: "fcfYield", nameZh: "自由现金流收益率", nameEn: "FCF Yield", category: "valuation", higherIsBetter: true, requires: "price+fundamental", startYear: 2021, note: "TTM (OCF−CapEx) / PIT 市值" },
  { key: "dividendYield", nameZh: "股息率", nameEn: "Dividend Yield", category: "valuation", higherIsBetter: true, requires: "price+fundamental", startYear: 2021, note: "TTM |分红| / PIT 市值" },
  { key: "ocfToEv", nameZh: "经营现金流/企业价值", nameEn: "OCF / EV", category: "valuation", higherIsBetter: true, requires: "price+fundamental", startYear: 2021, note: "TTM OCF / (市值+长期债务−现金)；EV/OCF 的单调化倒数（EV/EBITDA 替代）" },

  // ── 质量 quality ───────────────────────────────────────────────────────────
  { key: "roeTtm", nameZh: "TTM 净资产收益率", nameEn: "ROE (TTM)", category: "quality", higherIsBetter: true, requires: "fundamental", startYear: 2021, note: "TTM 净利 / 平均股东权益（本季与 4 季前均值）" },
  { key: "grossMargin", nameZh: "毛利率", nameEn: "Gross Margin", category: "quality", higherIsBetter: true, requires: "fundamental", startYear: 2021, note: "最新可见季毛利率" },
  { key: "opMargin", nameZh: "营业利润率", nameEn: "Operating Margin", category: "quality", higherIsBetter: true, requires: "fundamental", startYear: 2021, note: "最新可见季营业利润率" },
  { key: "ocfToNetIncome", nameZh: "现金含量", nameEn: "OCF / Net Income", category: "quality", higherIsBetter: true, requires: "fundamental", startYear: 2021, note: "TTM OCF / TTM 净利（净利>0 才给值）" },
  { key: "debtToAssets", nameZh: "资产负债率", nameEn: "Debt to Assets", category: "quality", higherIsBetter: false, requires: "fundamental", startYear: 2021, note: "最新季总负债 / 总资产" },
  { key: "accrualsToAssets", nameZh: "应计比率", nameEn: "Accruals to Assets", category: "quality", higherIsBetter: false, requires: "fundamental", startYear: 2021, note: "(TTM 净利 − TTM OCF) / 平均总资产（高应计 = 盈余质量差）" },

  // ── 成长 growth ────────────────────────────────────────────────────────────
  { key: "revenueYoY", nameZh: "营收同比", nameEn: "Revenue YoY", category: "growth", higherIsBetter: true, requires: "fundamental", startYear: 2021, note: "最新可见季营收 / 上年同季 − 1（按 fiscalDate ±35 天匹配）" },
  { key: "epsYoY", nameZh: "EPS 同比", nameEn: "EPS YoY", category: "growth", higherIsBetter: true, requires: "fundamental", startYear: 2021, note: "最新可见季 EPS / 上年同季 − 1（上年 EPS>0 才给值）" },
  { key: "revenueAccel", nameZh: "营收加速度", nameEn: "Revenue Acceleration", category: "growth", higherIsBetter: true, requires: "fundamental", startYear: 2021, note: "本季营收 YoY − 上季营收 YoY" },

  // ── 动量 momentum（前复权 adjClose 总收益口径） ────────────────────────────
  { key: "ret1m", nameZh: "近 1 月收益", nameEn: "1M Return", category: "momentum", higherIsBetter: true, requires: "price", startYear: 2000, note: "21 交易日总收益" },
  { key: "ret3m", nameZh: "近 3 月收益", nameEn: "3M Return", category: "momentum", higherIsBetter: true, requires: "price", startYear: 2000, note: "63 交易日总收益" },
  { key: "ret6m", nameZh: "近 6 月收益", nameEn: "6M Return", category: "momentum", higherIsBetter: true, requires: "price", startYear: 2000, note: "126 交易日总收益" },
  { key: "ret12m", nameZh: "近 12 月收益", nameEn: "12M Return", category: "momentum", higherIsBetter: true, requires: "price", startYear: 2000, note: "252 交易日总收益" },
  { key: "mom12_1", nameZh: "12−1 动量", nameEn: "12-1 Momentum", category: "momentum", higherIsBetter: true, requires: "price", startYear: 2000, note: "T−252 → T−21 总收益（剔除近月反转）" },
  { key: "dist52wHigh", nameZh: "距 52 周高点", nameEn: "Distance to 52W High", category: "momentum", higherIsBetter: true, requires: "price", startYear: 2000, note: "close / 252 日最高 − 1（0 = 创新高）" },

  // ── 波动 volatility ────────────────────────────────────────────────────────
  { key: "vol60d", nameZh: "60 日年化波动", nameEn: "60D Volatility", category: "volatility", higherIsBetter: false, requires: "price", startYear: 2000, note: "60 个日对数收益标准差 × √252" },
  { key: "beta252d", nameZh: "252 日 Beta", nameEn: "252D Beta", category: "volatility", higherIsBetter: false, requires: "price", startYear: 2000, note: "对 SPY 日对数收益回归斜率（重叠 ≥200 日）" },
  { key: "maxDrawdown12m", nameZh: "12 月最大回撤", nameEn: "12M Max Drawdown", category: "volatility", higherIsBetter: true, requires: "price", startYear: 2000, note: "252 日内 close/累计高点 − 1 的最小值（负数，越接近 0 越好）" },

  // ── 量价/流动性 liquidity ──────────────────────────────────────────────────
  { key: "turnover20d", nameZh: "20 日换手率", nameEn: "20D Turnover", category: "liquidity", higherIsBetter: true, requires: "price+fundamental", startYear: 2021, note: "20 日均成交额 / PIT 市值（日频换手）" },
  { key: "dollarVolPctile", nameZh: "成交额分位", nameEn: "Dollar Volume Percentile", category: "liquidity", higherIsBetter: true, requires: "price", startYear: 2000, note: "20 日均成交额在当月宇宙内的分位数 0–1（成交额 = 名义价×名义量，拆股因子相消）" },
  { key: "volTrend20_120", nameZh: "量能趋势", nameEn: "Volume Trend 20/120", category: "liquidity", higherIsBetter: true, requires: "price", startYear: 2000, note: "20 日均量 / 120 日均量 − 1（放量为正；方向标注为中性偏多）" },

  // ── 规模 size ──────────────────────────────────────────────────────────────
  { key: "logMarketCap", nameZh: "对数市值", nameEn: "Log Market Cap", category: "size", higherIsBetter: false, requires: "price+fundamental", startYear: 2021, note: "ln(PIT 市值)；小市值溢价方向" },
] as const;

export type FactorKey = (typeof FACTOR_DEFS)[number]["key"];

export const FACTOR_MAP: ReadonlyMap<string, FactorDef> = new Map(
  FACTOR_DEFS.map((d) => [d.key, d]),
);

/** 按数据面筛选（覆盖率报表 / 分阶段构建用） */
export function factorsByRequirement(
  ...reqs: FactorDataRequirement[]
): FactorDef[] {
  const set = new Set(reqs);
  return FACTOR_DEFS.filter((d) => set.has(d.requires));
}

/** 纯价格因子（2000 起可算） */
export const PRICE_FACTOR_KEYS = factorsByRequirement("price").map((d) => d.key);
/** 依赖基本面的因子（~2021 起） */
export const FUNDAMENTAL_FACTOR_KEYS = factorsByRequirement(
  "fundamental",
  "price+fundamental",
).map((d) => d.key);
