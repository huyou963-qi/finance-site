/**
 * 美股日线三种复权口径 —— 精确计算，不做启发式拆股猜测。
 *
 * 输入口径（Yahoo v8 chart，见 yahooChart.ts）：
 *   close_i    已按拆股回溯调整、未含现金分红
 *   adjClose_i 已含拆股 + 现金分红（总收益口径），最新一根 adjClose == close
 *   splits     精确除权事件（exDate 当日价格已是拆后刻度）
 *
 * 记：
 *   S_i = ∏ ratio(所有 exDate > date_i 的拆股)   —— 把 close_i 还原为名义价的乘数
 *   T_i = adjClose_i / close_i                    —— 拆股+分红的累计总收益因子（≤1，末根=1）
 *
 * 三种模式（对 O/H/L/C 同比例缩放，保持单根形态）：
 *   不复权 none      : P_i = raw_i × S_i          —— 当日真实成交价（名义价）
 *   前复权 forward   : P_i = raw_i × T_i          —— 锚定最新价，close 变为 adjClose
 *   后复权 backward  : P_i = raw_i × T_i × K      —— 锚定序列首根的名义价
 *                      K = S_0 / T_0，使 P_0 == 名义价_0
 *
 * 前复权与后复权是同一条总收益曲线的两种缩放（相差常数 K），只是锚点不同。
 * 成交量：Yahoo volume 为拆后股数口径，不复权时需 ÷ S_i 还原为当日名义股数。
 */

export type PriceAdjustmentMode = "forward" | "backward" | "none";

export function parsePriceAdjustmentMode(
  raw: string | null | undefined,
): PriceAdjustmentMode {
  const v = (raw ?? "forward").trim().toLowerCase();
  if (v === "backward" || v === "back" || v === "后复权") return "backward";
  if (v === "none" || v === "raw" || v === "不复权") return "none";
  return "forward";
}

/** 拆股事件（exDate 为除权生效日 YYYY-MM-DD） */
export type SplitEvent = { exDate: string; ratio: number };

/** 输入日线（Yahoo quote 口径） */
export type RawDailyBar = {
  /** UTC 日零点秒 */
  time: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  adjClose: number;
  volume: number | null;
};

export type AdjustedBar = {
  time: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
};

const DAY_SEC = 86400;

/**
 * 过滤/修正脏日线：
 * - Yahoo 对期货 / 外汇 / 指数（GC=F、CL=F、EURUSD=X、^TNX 等）在**美股节假日**常返回
 *   O/H/L/C 全为 0 的占位行；这类 0 收盘价会污染 BOLL 均值与标准差、拉低 MA、并让
 *   「可见区间最低」误判为 0。close 非有限或 ≤0 的整根丢弃。
 * - close 有效但个别腿（open/high/low）非有限或 ≤0（Yahoo 偶发单腿脏值）时把该腿钳到
 *   close，避免出现 0 影线毛刺；adjClose 非正时回退为 close（前复权因子退化为 1）。
 */
export function sanitizeRawDailyBars(
  bars: readonly RawDailyBar[],
): RawDailyBar[] {
  const out: RawDailyBar[] = [];
  for (const b of bars) {
    if (!Number.isFinite(b.close) || b.close <= 0) continue;
    const fixLeg = (v: number | null): number | null =>
      v == null || !Number.isFinite(v) || v <= 0 ? b.close : v;
    out.push({
      ...b,
      open: fixLeg(b.open),
      high: fixLeg(b.high),
      low: fixLeg(b.low),
      adjClose:
        Number.isFinite(b.adjClose) && b.adjClose > 0 ? b.adjClose : b.close,
    });
  }
  return out;
}

function exDateToUtcSec(exDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(exDate.trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/**
 * 每根 bar 的「未来拆股累计乘数」S_i：把 Yahoo 的拆股调整价还原为当日名义价。
 * exDate 当日的 bar 已是拆后刻度，故只累乘 exDate 严格晚于该 bar 日期的拆股。
 */
export function computeSplitFactors(
  bars: readonly RawDailyBar[],
  splits: readonly SplitEvent[],
): number[] {
  const events = splits
    .map((s) => ({ sec: exDateToUtcSec(s.exDate), ratio: s.ratio }))
    .filter(
      (s): s is { sec: number; ratio: number } =>
        s.sec != null && Number.isFinite(s.ratio) && s.ratio > 0,
    )
    .sort((a, b) => a.sec - b.sec);

  const factors = new Array<number>(bars.length).fill(1);
  if (events.length === 0) return factors;

  // 从后往前累乘：走到 bar i 时，acc 已包含所有 exDate > date_i 的拆股
  let acc = 1;
  let e = events.length - 1;
  for (let i = bars.length - 1; i >= 0; i--) {
    const barDay = Math.floor(bars[i]!.time / DAY_SEC) * DAY_SEC;
    while (e >= 0 && events[e]!.sec > barDay) {
      acc *= events[e]!.ratio;
      e -= 1;
    }
    factors[i] = acc;
  }
  return factors;
}

/** T_i = adjClose_i / close_i；close 非正时退化为 1 */
function totalReturnFactor(bar: RawDailyBar): number {
  if (!Number.isFinite(bar.close) || bar.close <= 0) return 1;
  const t = bar.adjClose / bar.close;
  return Number.isFinite(t) && t > 0 ? t : 1;
}

function scaleLeg(v: number | null, k: number): number | null {
  return v == null || !Number.isFinite(v) ? null : v * k;
}

/**
 * 按模式复权。bars 须按时间升序，且为**同一 symbol 的连续序列**。
 * 后复权锚点为传入序列的首根——调用方应传入该标的库内最早的 bar，
 * 否则改变区间会使后复权刻度整体平移（形态不变）。
 */
export function adjustDailyBars(
  bars: readonly RawDailyBar[],
  splits: readonly SplitEvent[],
  mode: PriceAdjustmentMode,
): AdjustedBar[] {
  if (bars.length === 0) return [];
  const splitFactors = computeSplitFactors(bars, splits);

  if (mode === "none") {
    return bars.map((b, i) => {
      const s = splitFactors[i]!;
      return {
        time: b.time,
        open: scaleLeg(b.open, s),
        high: scaleLeg(b.high, s),
        low: scaleLeg(b.low, s),
        close: b.close * s,
        // Yahoo volume 为拆后股数；名义股数需除以 S_i
        volume: b.volume == null ? null : b.volume / s,
      };
    });
  }

  let k = 1;
  if (mode === "backward") {
    const t0 = totalReturnFactor(bars[0]!);
    const s0 = splitFactors[0]!;
    k = t0 > 0 ? s0 / t0 : 1;
  }

  return bars.map((b) => {
    const scale = totalReturnFactor(b) * k;
    return {
      time: b.time,
      open: scaleLeg(b.open, scale),
      high: scaleLeg(b.high, scale),
      low: scaleLeg(b.low, scale),
      close: b.close * scale,
      // 复权价对应拆后股数口径，成交量保持 Yahoo 原值
      volume: b.volume,
    };
  });
}
