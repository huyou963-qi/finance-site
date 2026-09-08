/**
 * 内部人交易因子（Tier B / DERA）——纯函数。
 *
 * 照 [[phase1-factor-library]] 的 computeFundamentalFactors 与 Phase 5 computeFundingFactors 模式：
 * 读 PIT 可见的月度聚合 → 产出 Record<string,number>，与其余因子合并后进 winsorize+zscore →
 * FactorSnapshot，由此自动获得 screener / 回测 / IC-IR / regime 全部能力。
 *
 * ── PIT 口径：按 filedAt 归月，且只取「整月已过去」的桶 ──────────────────────
 * 可见日取 `filedAt`（Form 4 落 EDGAR 之日）而非 `transactionDate`：交易日的信息当时并不公开，
 * 用它会引入前视。实测两者差距均值 15 天但 p95 只有 11 天——右偏说明存在远迟于法定 2 个工作日的
 * 补报，正是必须用 filedAt 的理由。
 *
 * 月桶只在「该月最后一天 ≤ asOf」时计入，所以即便 asOf 不是月末也不会吃到 asOf 之后的申报。
 *
 * ⚠ **实现层滞后（与前视无关，但决定能否实盘）**：本因子的数据来自 DERA 季度包，而 DERA 出版
 * 滞后很大（实测 2026-09 时 2026q2 仍 404，即季末後 70 天仍未发布）。因此 filedAt 口径回答的是
 * 「这个信号有没有预测力」（研究问题，无前视，成立），**不等于**「今天就能照它下单」。
 * 要实盘必须换用实时 Form 4 源（Tier A 的逐份抓取，或日度 form.idx），不能用 DERA。
 * 拿本因子的 IC/回测结果去推断实盘收益前，务必先解决数据时效。
 *
 * ── 为什么用股数而不用金额 ──────────────────────────────────────────────
 * 金额口径要求 `price_check='verified'`，而该校验受日线宇宙限制只覆盖 22.6% 的 P/S 交易
 * （见 AGENTS.md）。股数由申报直接给出、且已被 anomaly 标记过滤，覆盖全部 24,003 只发行人。
 * 用金额会把因子宇宙砍掉近八成，得不偿失。
 *
 * ── 为什么只算 P/S ────────────────────────────────────────────────────
 * A(授予)+F(代扣税)+M(行权) 合计约六成，是薪酬机制的机械产物、不含主观判断；
 * 掺进来得到的是薪酬噪音而非信号（AGENTS.md 实测口径）。
 */

/** 回看窗口（月）。内部人信号的经典口径为半年。 */
export const INSIDER_WINDOW_MONTHS = 6;

/**
 * 窗口内 P/S 交易笔数下限，不足则整只不出值。
 *
 * 照 Phase 5 MIN_FILER_COVERAGE 的思路：与其产出「看似合理的错值」毒化回测/IC/选股，
 * 不如不出值。单笔交易会让 netBuyRatio 直接取 ±1 的极值，winsorize 也压不住——
 * 那不是「强信号」而是「样本太少」，两者在 zscore 里无法区分。
 */
export const MIN_INSIDER_TRANSACTIONS = 3;

/** 按 filedAt 归月的聚合。month 为该月首日 ISO（YYYY-MM-01）。 */
export type InsiderMonthAgg = {
  month: string;
  /** 公开市场买入（P）股数合计 */
  buyShares: number;
  /** 公开市场卖出（S）股数合计 */
  sellShares: number;
  /** 含公开市场买入的申报份数；按申报去重，故可跨月相加 */
  buyFilings: number;
  /** P 交易笔数 */
  buyTxns: number;
  /** S 交易笔数 */
  sellTxns: number;
};

/** 该月最后一天的 ISO 日期 */
function monthEnd(monthIso: string): string {
  const [y, m] = monthIso.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

/** 从 asOf 往回数 INSIDER_WINDOW_MONTHS 个月的窗口下界（含） */
function windowStart(asOf: string): string {
  const [y, m] = asOf.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 - (INSIDER_WINDOW_MONTHS - 1), 1));
  return d.toISOString().slice(0, 7) + "-01";
}

/**
 * @param months 该标的按 filedAt 归月的聚合，顺序不限
 * @param asOf   因子截面日
 */
export function computeInsiderFactors(months: InsiderMonthAgg[], asOf: string): Record<string, number> {
  const lo = windowStart(asOf);
  // 整月已过去才计入：月末 ≤ asOf。asOf 为月末时当月完整可用，非月末时保守剔除当月。
  const win = months.filter((x) => x.month >= lo && monthEnd(x.month) <= asOf);
  if (!win.length) return {};

  let buyShares = 0, sellShares = 0, buyFilings = 0, txns = 0;
  for (const x of win) {
    buyShares += x.buyShares;
    sellShares += x.sellShares;
    buyFilings += x.buyFilings;
    txns += x.buyTxns + x.sellTxns;
  }
  if (txns < MIN_INSIDER_TRANSACTIONS) return {};

  const out: Record<string, number> = {};
  const gross = buyShares + sellShares;
  // 净买入比例 ∈ [−1,1]：+1 为窗口内只买、−1 为只卖。用比例而非净额，避免被公司规模主导。
  if (gross > 0) out.insiderNetBuyRatio = (buyShares - sellShares) / gross;
  // 买入广度：有多少份申报报告了公开市场买入。买入比卖出信息量高（卖出常出于分散/流动性需要）。
  out.insiderBuyBreadth = buyFilings;
  return out;
}
