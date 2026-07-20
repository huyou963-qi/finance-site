/**
 * 因子计算 + 截面标准化（Phase 1 WS3）。
 *
 * - 技术面因子：由 equity_daily_bar 的 adjClose（前复权 = 总收益口径）序列计算；
 *   成交额用 rawClose × volume —— 名义价×名义量的拆股因子相消，等于库内两列直乘。
 * - 基本面因子：由 WS2 PIT 截面（buildPitCrossSection）计算，复用 computeTtm /
 *   computeQuarterRatios（入参均为升序 QuarterFundamentalRow）。
 * - 标准化：当月截面 winsorize（±3×1.4826×MAD，MAD 退化时回退 p1/p99）→ zscore；
 *   sectorZscore 在 GICS sector 内同法（sector 用 EquitySecurity 现值近似，非 PIT）。
 */

import { sanitizeRawDailyBars, type RawDailyBar } from "@/lib/equity/priceAdjustment";
import { computeTtm } from "@/lib/equity/ttm";
import type { PitEquityRow, PitQuarterRow } from "@/lib/quant/pitCrossSection";

const DAY_SEC = 86_400;
const DAY_MS = 86_400_000;

// ────────────────────────────────────────────────────────── 技术面

export type TechSeries = {
  /** UTC 日零点秒，升序 */
  times: number[];
  /** 前复权收盘（= sanitize 后的 adjClose，总收益口径） */
  adj: number[];
  /** 库内原始 close（现拆股刻度、未含分红）——成交额计算用 */
  rawClose: number[];
  volume: (number | null)[];
};

export type TechBarInput = {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  adjClose: number;
  volume: number | null;
};

/** DB 行 → 技术面序列（脏 0 价行按 sanitizeRawDailyBars 口径清洗） */
export function buildTechSeries(rows: TechBarInput[]): TechSeries {
  const raw: RawDailyBar[] = rows.map((r) => ({
    time: Math.floor(r.date.getTime() / 1000),
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    adjClose: r.adjClose,
    volume: r.volume,
  }));
  const clean = sanitizeRawDailyBars(raw);
  return {
    times: clean.map((b) => Math.floor(b.time / DAY_SEC) * DAY_SEC),
    adj: clean.map((b) => b.adjClose),
    rawClose: clean.map((b) => b.close),
    volume: clean.map((b) => b.volume),
  };
}

/** 基准（SPY）日对数收益表：daySec → ln(adj_i / adj_{i-1}) */
export function buildBenchmarkReturns(s: TechSeries): Map<number, number> {
  const out = new Map<number, number>();
  for (let i = 1; i < s.times.length; i++) {
    const r = Math.log(s.adj[i]! / s.adj[i - 1]!);
    if (Number.isFinite(r)) out.set(s.times[i]!, r);
  }
  return out;
}

function lastIndexAtOrBefore(times: number[], tSec: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= tSec) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sampleStd(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export type TechFactorResult = {
  /** 已定义的因子值（缺数据的键不出现） */
  values: Record<string, number>;
  /** 20 日均成交额（turnover20d / dollarVolPctile 的中间量，非注册因子） */
  avgDollarVol20: number | null;
};

/**
 * 单标的 T 时点技术面因子。T 前 staleDays 天内无成交（退市/停牌）返回 null。
 */
export function computeTechnicalFactors(
  s: TechSeries,
  tSec: number,
  benchmarkRet: Map<number, number> | null,
  staleDays = 7,
): TechFactorResult | null {
  const i = lastIndexAtOrBefore(s.times, tSec);
  if (i < 0 || tSec - s.times[i]! > staleDays * DAY_SEC) return null;

  const v: Record<string, number> = {};
  const put = (key: string, x: number | null) => {
    if (x != null && Number.isFinite(x)) v[key] = x;
  };

  const retOver = (n: number): number | null =>
    i - n >= 0 && s.adj[i - n]! > 0 ? s.adj[i]! / s.adj[i - n]! - 1 : null;
  put("ret1m", retOver(21));
  put("ret3m", retOver(63));
  put("ret6m", retOver(126));
  put("ret12m", retOver(252));
  put(
    "mom12_1",
    i - 252 >= 0 && s.adj[i - 252]! > 0 ? s.adj[i - 21]! / s.adj[i - 252]! - 1 : null,
  );

  if (i - 251 >= 0) {
    let hi = 0;
    for (let k = i - 251; k <= i; k++) if (s.adj[k]! > hi) hi = s.adj[k]!;
    put("dist52wHigh", hi > 0 ? s.adj[i]! / hi - 1 : null);

    let peak = -Infinity;
    let mdd = 0;
    for (let k = i - 251; k <= i; k++) {
      if (s.adj[k]! > peak) peak = s.adj[k]!;
      const dd = s.adj[k]! / peak - 1;
      if (dd < mdd) mdd = dd;
    }
    put("maxDrawdown12m", mdd);
  }

  if (i >= 60) {
    const rets: number[] = [];
    for (let k = i - 59; k <= i; k++) {
      const r = Math.log(s.adj[k]! / s.adj[k - 1]!);
      if (Number.isFinite(r)) rets.push(r);
    }
    const sd = sampleStd(rets);
    put("vol60d", sd != null ? sd * Math.sqrt(252) : null);
  }

  if (benchmarkRet && i - 251 >= 1) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let k = Math.max(1, i - 251); k <= i; k++) {
      const mb = benchmarkRet.get(s.times[k]!);
      if (mb == null) continue;
      const r = Math.log(s.adj[k]! / s.adj[k - 1]!);
      if (!Number.isFinite(r)) continue;
      xs.push(mb);
      ys.push(r);
    }
    if (xs.length >= 200) {
      const mx = mean(xs)!;
      const my = mean(ys)!;
      let cov = 0;
      let varx = 0;
      for (let k = 0; k < xs.length; k++) {
        cov += (xs[k]! - mx) * (ys[k]! - my);
        varx += (xs[k]! - mx) * (xs[k]! - mx);
      }
      put("beta252d", varx > 0 ? cov / varx : null);
    }
  }

  const volsIn = (n: number): number[] => {
    const out: number[] = [];
    for (let k = Math.max(0, i - n + 1); k <= i; k++) {
      const vol = s.volume[k];
      if (vol != null && Number.isFinite(vol) && vol >= 0) out.push(vol);
    }
    return out;
  };
  const v20 = volsIn(20);
  const v120 = volsIn(120);
  if (v20.length >= 15 && v120.length >= 90) {
    const m20 = mean(v20)!;
    const m120 = mean(v120)!;
    put("volTrend20_120", m120 > 0 ? m20 / m120 - 1 : null);
  }

  let avgDollarVol20: number | null = null;
  {
    const dv: number[] = [];
    for (let k = Math.max(0, i - 19); k <= i; k++) {
      const vol = s.volume[k];
      if (vol != null && Number.isFinite(vol) && vol > 0) dv.push(s.rawClose[k]! * vol);
    }
    if (dv.length >= 15) avgDollarVol20 = mean(dv);
  }

  return { values: v, avgDollarVol20 };
}

// ────────────────────────────────────────────────────────── 基本面

/** fiscalDate 相差 [330, 400] 天视为上年同季 */
function yearAgoQuarter(quarters: PitQuarterRow[], of: PitQuarterRow): PitQuarterRow | null {
  const ofMs = Date.parse(`${of.fiscalDate}T00:00:00Z`);
  for (let i = quarters.length - 1; i >= 0; i--) {
    const gap = (ofMs - Date.parse(`${quarters[i]!.fiscalDate}T00:00:00Z`)) / DAY_MS;
    if (gap >= 330 && gap <= 400) return quarters[i]!;
    if (gap > 400) break;
  }
  return null;
}

function revYoYOf(quarters: PitQuarterRow[], of: PitQuarterRow): number | null {
  const prev = yearAgoQuarter(quarters, of);
  if (!prev || of.revenue == null || prev.revenue == null || prev.revenue <= 0) return null;
  return of.revenue / prev.revenue - 1;
}

/** 最新可见季距 T 超过此天数视为陈旧（换 tag 留洞/停更股），不出任何基本面因子 */
export const MAX_QUARTER_STALE_DAYS = 200;

/**
 * 单标的 T 时点基本面因子（turnover20d 需成交额中间量，由构建脚本合成）。
 * 返回仅含已定义值的键值表。
 *
 * 口径守卫（GOOGL/TSLA 换 tag 时代留洞暴露的问题）：
 * - 最新可见季 fiscalDate 距 T > 200 天 → 全部基本面因子不出（拿两年前的"最新季"
 *   算毛利率/市值分母会得到误导值）；
 * - TTM 类因子（roeTtm 等）一律经 computeTtm 的 240–300 天连续性校验，不用
 *   computeQuarterRatios 的 sumWindow（其不检查断档，会把跨年不连续 4 季加总）。
 */
export function computeFundamentalFactors(row: PitEquityRow, t: string): Record<string, number> {
  const out: Record<string, number> = {};
  const put = (key: string, x: number | null) => {
    if (x != null && Number.isFinite(x)) out[key] = x;
  };

  const quarters = row.quarters;
  const latest = row.latestQuarter;
  if (!latest) return out;
  const staleDays =
    (Date.parse(`${t}T00:00:00Z`) - Date.parse(`${latest.fiscalDate}T00:00:00Z`)) / DAY_MS;
  if (staleDays > MAX_QUARTER_STALE_DAYS) return out;

  const ttm = computeTtm(quarters);
  const mcap = row.marketCap;

  // ── 估值（分母 PIT 市值） ──
  if (mcap != null && mcap > 0) {
    put("earningsYield", ttm?.netIncome != null ? ttm.netIncome / mcap : null);
    put("bookYield", latest.equity != null ? latest.equity / mcap : null);
    put("salesYield", ttm?.revenue != null ? ttm.revenue / mcap : null);
    put("fcfYield", ttm?.fcf != null ? ttm.fcf / mcap : null);
    if (ttm) {
      // 不分红公司 dividendsPaid 常为 null：TTM 窗口成立即按 0 计（股息率真实为 0）
      const idx = quarters.length - 4;
      let div = 0;
      for (let k = idx; k < quarters.length; k++) div += quarters[k]!.dividendsPaid ?? 0;
      put("dividendYield", Math.abs(div) / mcap);
    }
    const ev = mcap + (latest.longTermDebt ?? 0) - (latest.cash ?? 0);
    put("ocfToEv", ttm?.ocf != null && ev > 0 ? ttm.ocf / ev : null);
    put("logMarketCap", Math.log(mcap));
  }

  // ── 质量 ──
  // 4 季前的期末行：须真是上年同季（330–400 天），有洞序列里可能是陈年行
  const prev4Raw = quarters.length >= 5 ? quarters[quarters.length - 5]! : null;
  const prev4 =
    prev4Raw != null &&
    (() => {
      const gap =
        (Date.parse(`${latest.fiscalDate}T00:00:00Z`) -
          Date.parse(`${prev4Raw.fiscalDate}T00:00:00Z`)) /
        DAY_MS;
      return gap >= 330 && gap <= 400;
    })()
      ? prev4Raw
      : null;
  const avgEquity =
    latest.equity != null
      ? prev4?.equity != null
        ? (latest.equity + prev4.equity) / 2
        : latest.equity
      : null;
  put(
    "roeTtm",
    ttm?.netIncome != null && avgEquity != null && avgEquity > 0
      ? ttm.netIncome / avgEquity
      : null,
  );
  put("grossMargin", latest.grossMargin);
  put("opMargin", latest.opMargin);
  put(
    "ocfToNetIncome",
    ttm?.ocf != null && ttm.netIncome != null && ttm.netIncome > 0
      ? ttm.ocf / ttm.netIncome
      : null,
  );
  put(
    "debtToAssets",
    latest.totalLiabilities != null && latest.totalAssets != null && latest.totalAssets !== 0
      ? latest.totalLiabilities / latest.totalAssets
      : null,
  );
  if (ttm?.netIncome != null && ttm.ocf != null) {
    const currAssets = latest.totalAssets;
    const prevAssets = prev4?.totalAssets ?? null;
    const avgAssets =
      currAssets != null
        ? prevAssets != null
          ? (currAssets + prevAssets) / 2
          : currAssets
        : null;
    put(
      "accrualsToAssets",
      avgAssets != null && avgAssets > 0 ? (ttm.netIncome - ttm.ocf) / avgAssets : null,
    );
  }

  // ── 成长（可见序列内按 fiscalDate 匹配上年同季，天然 PIT） ──
  const revYoY = revYoYOf(quarters, latest);
  put("revenueYoY", revYoY);
  const prevYearQ = yearAgoQuarter(quarters, latest);
  put(
    "epsYoY",
    latest.eps != null && prevYearQ?.eps != null && prevYearQ.eps > 0
      ? latest.eps / prevYearQ.eps - 1
      : null,
  );
  if (quarters.length >= 2) {
    const prevQ = quarters[quarters.length - 2]!;
    // 上季须真是相邻财季（45–130 天），断档时不算加速度
    const gap =
      (Date.parse(`${latest.fiscalDate}T00:00:00Z`) -
        Date.parse(`${prevQ.fiscalDate}T00:00:00Z`)) /
      DAY_MS;
    if (gap >= 45 && gap <= 130) {
      const prevYoY = revYoYOf(quarters, prevQ);
      put("revenueAccel", revYoY != null && prevYoY != null ? revYoY - prevYoY : null);
    }
  }

  return out;
}

// ────────────────────────────────────────────────────────── 截面标准化

function medianOf(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function quantileOf(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** 截面标准化最少样本数（低于此值 zscore 全 null） */
export const MIN_ZSCORE_SAMPLE = 8;

/**
 * winsorize + zscore：±3×1.4826×MAD 截尾（MAD=0 时回退 p1/p99），再按截尾后
 * 均值/标准差标准化。与输入等长；null 输入、样本不足或零离散度输出 null。
 */
export function winsorizedZscores(values: (number | null)[]): (number | null)[] {
  const valid = values.filter((x): x is number => x != null && Number.isFinite(x));
  if (valid.length < MIN_ZSCORE_SAMPLE) return values.map(() => null);

  const med = medianOf(valid)!;
  const mad = medianOf(valid.map((x) => Math.abs(x - med)))!;
  let lo: number;
  let hi: number;
  if (mad > 0) {
    lo = med - 3 * 1.4826 * mad;
    hi = med + 3 * 1.4826 * mad;
  } else {
    const sorted = [...valid].sort((a, b) => a - b);
    lo = quantileOf(sorted, 0.01);
    hi = quantileOf(sorted, 0.99);
  }
  const clamped = valid.map((x) => Math.min(hi, Math.max(lo, x)));
  const m = mean(clamped)!;
  const sd = sampleStd(clamped);
  if (sd == null || sd <= 0) return values.map(() => null);

  return values.map((x) =>
    x == null || !Number.isFinite(x) ? null : (Math.min(hi, Math.max(lo, x)) - m) / sd,
  );
}

/** 分位数排名 0–1（dollarVolPctile 用）；与输入等长，null 保持 null */
export function percentileRanks(values: (number | null)[]): (number | null)[] {
  const idx = values
    .map((x, i) => ({ x, i }))
    .filter((p): p is { x: number; i: number } => p.x != null && Number.isFinite(p.x));
  if (idx.length < 2) return values.map(() => null);
  idx.sort((a, b) => a.x - b.x);
  const out: (number | null)[] = values.map(() => null);
  // 并列值取平均秩
  let k = 0;
  while (k < idx.length) {
    let j = k;
    while (j + 1 < idx.length && idx[j + 1]!.x === idx[k]!.x) j++;
    const rank = (k + j) / 2 / (idx.length - 1);
    for (let m2 = k; m2 <= j; m2++) out[idx[m2]!.i] = rank;
    k = j + 1;
  }
  return out;
}
