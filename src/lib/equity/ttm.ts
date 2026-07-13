/**
 * 真 TTM 与衍生估值（Phase 2 P6）。
 * 输入为已落库的季度快照（periodType=Q），滚动最近 4 季求和得 TTM 流量，
 * 估值用现价 × 股本推市值。TTM 与估值均为读取时计算，不落库（DB 只存水平值）。
 */

export type QuarterFundamentalRow = {
  period: string;
  fiscalDate: string;
  revenue: number | null;
  netIncome: number | null;
  eps: number | null;
  ocf: number | null;
  capex: number | null;
  dividendsPaid: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  equity: number | null;
  longTermDebt: number | null;
  cash: number | null;
  sharesOutstanding: number | null;
};

export type TtmAggregates = {
  /** TTM 覆盖的 4 个季度标签（升序） */
  periods: string[];
  revenue: number | null;
  netIncome: number | null;
  eps: number | null;
  ocf: number | null;
  capex: number | null;
  /** FCF = OCF − CapEx（CapEx 在 XBRL 中为正的现金流出） */
  fcf: number | null;
  dividendsPaid: number | null;
};

export type ValuationCard = {
  price: number | null;
  marketCap: number | null;
  /** 市值来源：shares=现价×股本；profile=主档缓存市值 */
  marketCapSource: "shares" | "profile" | null;
  peTtm: number | null;
  pb: number | null;
  psTtm: number | null;
  /** EV ≈ 市值 + 长期债务 − 现金 */
  ev: number | null;
  fcfYield: number | null;
  dividendYield: number | null;
};

const DAY_MS = 86_400_000;

function spanDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** 4 季之和；任一季缺失该字段则返回 null（避免半截 TTM 误导） */
function sum4(rows: QuarterFundamentalRow[], sel: (r: QuarterFundamentalRow) => number | null): number | null {
  let acc = 0;
  for (const r of rows) {
    const v = sel(r);
    if (v == null || !Number.isFinite(v)) return null;
    acc += v;
  }
  return acc;
}

/**
 * 滚动 TTM：取按 fiscalDate 升序的季度序列的最近 4 季。
 * 连续性校验：首季末→末季末跨度须 ≈3 个季度（缺季/断档则整体判不可用）。
 */
export function computeTtm(quarters: QuarterFundamentalRow[]): TtmAggregates | null {
  const sorted = [...quarters].sort((a, b) => a.fiscalDate.localeCompare(b.fiscalDate));
  if (sorted.length < 4) return null;
  const last4 = sorted.slice(-4);
  const span = spanDays(last4[0]!.fiscalDate, last4[3]!.fiscalDate);
  // 4 个连续季度的首季末→末季末约 273 天；放宽到 240–300 容纳 53 周财年
  if (span < 240 || span > 300) return null;

  return {
    periods: last4.map((r) => r.period),
    revenue: sum4(last4, (r) => r.revenue),
    netIncome: sum4(last4, (r) => r.netIncome),
    eps: sum4(last4, (r) => r.eps),
    ocf: sum4(last4, (r) => r.ocf),
    capex: sum4(last4, (r) => r.capex),
    fcf: (() => {
      const ocf = sum4(last4, (r) => r.ocf);
      const capex = sum4(last4, (r) => r.capex);
      return ocf != null && capex != null ? ocf - capex : null;
    })(),
    dividendsPaid: sum4(last4, (r) => r.dividendsPaid),
  };
}

function ratio(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0 || !Number.isFinite(num) || !Number.isFinite(den)) {
    return null;
  }
  return num / den;
}

/**
 * 估值卡：市值优先 现价×最新季股本，股本缺失（多股类公司等）退回主档缓存市值。
 */
export function computeValuation(
  ttm: TtmAggregates | null,
  latestQuarter: QuarterFundamentalRow | null,
  price: number | null,
  profileMarketCap: number | null = null,
): ValuationCard {
  const shares = latestQuarter?.sharesOutstanding ?? null;
  let marketCap: number | null = null;
  let marketCapSource: ValuationCard["marketCapSource"] = null;
  if (price != null && shares != null && shares > 0) {
    marketCap = price * shares;
    marketCapSource = "shares";
  } else if (profileMarketCap != null && profileMarketCap > 0) {
    marketCap = profileMarketCap;
    marketCapSource = "profile";
  }

  const ni = ttm?.netIncome ?? null;
  const equity = latestQuarter?.equity ?? null;
  const ltDebt = latestQuarter?.longTermDebt ?? null;
  const cash = latestQuarter?.cash ?? null;
  const div = ttm?.dividendsPaid ?? null;

  return {
    price,
    marketCap,
    marketCapSource,
    // 亏损不给 PE
    peTtm: ni != null && ni > 0 ? ratio(marketCap, ni) : null,
    pb: equity != null && equity > 0 ? ratio(marketCap, equity) : null,
    psTtm: ratio(marketCap, ttm?.revenue ?? null),
    ev: marketCap != null ? marketCap + (ltDebt ?? 0) - (cash ?? 0) : null,
    fcfYield: ratio(ttm?.fcf ?? null, marketCap),
    // XBRL PaymentsOfDividends 为正的现金流出
    dividendYield: div != null ? ratio(Math.abs(div), marketCap) : null,
  };
}
