/**
 * 「股票数据」行情、估值、趋势类单元格（纯函数）。口径不在这里实现：
 * - 复权：priceAdjustment.adjustDailyBars（不复权）/ adjClose（前复权，总收益口径）；
 * - 趋势与风险：factorCompute.computeTechnicalFactors（与月度因子快照同一函数）；
 * - 估值：factorCompute.computeFundamentalFactors 在 pitCrossSection.buildPitRows 装配的
 *   截止日可见数据上计算（同上），这里只把收益率换算成倍数。
 */

import { adjustDailyBars, sanitizeRawDailyBars, type RawDailyBar, type SplitEvent } from "@/lib/equity/priceAdjustment";
import {
  buildBenchmarkReturns,
  buildTechSeries,
  computeFundamentalFactors,
  computeTechnicalFactors,
  type TechFactorResult,
  type TechSeries,
} from "@/lib/quant/factorCompute";
import type { PitEquityRow } from "@/lib/quant/pitCrossSection";
import type { PriceField, TrendFactorKey, ValuationField } from "./indicatorRegistry";
import type { AsOfSpec, Cell, ColumnParams, RangeSpec } from "./types";

const DAY_SEC = 86_400;
const DAY_MS = 86_400_000;
/** 截止日前这么多天内没有成交，视为无行情（停牌、退市），与因子快照一致 */
export const PRICE_STALE_DAYS = 7;
/** 趋势类因子需要的回看：252 个交易日以上 */
export const TREND_LOOKBACK_DAYS = 400;
/** 区间涨跌要取区间开始前一个交易日，多读几天跨过长假 */
export const RANGE_BASE_LOOKBACK_DAYS = 14;

const isoToSec = (d: string) => Date.parse(`${d}T00:00:00Z`) / 1000;
const secToIso = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);

export function shiftDays(d: string, days: number): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 日历月加减（月末对齐：3-31 减 1 月是 2-28/29） */
export function shiftMonths(d: string, months: number): string {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ny, nm, Math.min(day, last))).toISOString().slice(0, 10);
}

export function resolveAsOfDate(a: AsOfSpec | undefined, today: string): string {
  return a?.kind === "date" ? a.date : today;
}

/**
 * 区间起止（含两端）。预设区间以 today 为终点，起点取 N 个月前的次日，
 * 这样「区间开始前一交易日」正好是 N 个月前那天（或之前最近一个交易日）的收盘。
 */
export function resolveRangeDates(r: RangeSpec | undefined, today: string): { from: string; to: string } {
  if (!r || r.kind === "preset") {
    const preset = r?.preset ?? "1y";
    if (preset === "ytd") return { from: `${today.slice(0, 4)}-01-01`, to: today };
    const months = { "1m": 1, "3m": 3, "6m": 6, "1y": 12, "3y": 36, "5y": 60 }[preset];
    return { from: shiftDays(shiftMonths(today, -months), 1), to: today };
  }
  return { from: r.from, to: r.to };
}

/** 需要读取的日线区间（含回看），供服务端合并后批量读取 */
export function barWindowFor(kind: "close" | "range" | "trend", params: ColumnParams, today: string): { from: string; to: string } {
  if (kind === "range") {
    const { from, to } = resolveRangeDates(params.range, today);
    return { from: shiftDays(from, -RANGE_BASE_LOOKBACK_DAYS), to };
  }
  const asOf = resolveAsOfDate(params.asOf, today);
  return { from: shiftDays(asOf, kind === "trend" ? -TREND_LOOKBACK_DAYS : -PRICE_STALE_DAYS - 7), to: asOf };
}

/** 把若干区间合并成互不重叠的读取窗口（相邻 30 天内的并成一个） */
export function mergeWindows(ws: readonly { from: string; to: string }[]): { from: string; to: string }[] {
  const sorted = [...ws].sort((a, b) => a.from.localeCompare(b.from));
  const out: { from: string; to: string }[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && shiftDays(last.to, 30) >= w.from) {
      if (w.to > last.to) last.to = w.to;
    } else out.push({ ...w });
  }
  return out;
}

function lastIndexAtOrBefore(bars: readonly RawDailyBar[], sec: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid]!.time <= sec) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export function toTechSeries(bars: readonly RawDailyBar[]): TechSeries {
  return buildTechSeries(bars.map((b) => ({ ...b, date: new Date(b.time * 1000) })));
}

export function benchmarkReturns(bars: readonly RawDailyBar[] | undefined): Map<number, number> | null {
  return bars?.length ? buildBenchmarkReturns(toTechSeries(bars)) : null;
}

export type MarketInput = {
  /** 原始日线（升序，未清洗也可） */
  bars: readonly RawDailyBar[];
  splits: readonly SplitEvent[];
  /** 截止日 → 该日可见的基本面与市值（buildPitRows 的输出） */
  pitByDate: ReadonlyMap<string, PitEquityRow>;
  isFund: boolean;
};

export type MarketContext = { today: string; benchmark: Map<number, number> | null };

const ok = (v: number, p: string, d?: string): Cell => (Number.isFinite(v) ? { v, s: "ok", p, ...(d ? { d } : {}) } : { v: null, s: "noValue", p });

/**
 * 一只股票的行情类取值器：日线只清洗一次，趋势因子与估值按截止日记忆，
 * 同一截止日的多列只算一遍。
 */
export function createMarketResolver(input: MarketInput, ctx: MarketContext) {
  const bars = sanitizeRawDailyBars(input.bars);
  let series: TechSeries | null = null;
  const trendMemo = new Map<string, TechFactorResult | null>();
  const fundMemo = new Map<string, Record<string, number>>();

  const freshIndex = (date: string): number => {
    const i = lastIndexAtOrBefore(bars, isoToSec(date));
    return i >= 0 && isoToSec(date) - bars[i]!.time <= PRICE_STALE_DAYS * DAY_SEC ? i : -1;
  };

  const nominal = (i: number) => adjustDailyBars([bars[i]!], input.splits, "none")[0]!.close;
  const priceAt = (i: number, adjust: ColumnParams["adjust"]) => (adjust === "none" ? nominal(i) : bars[i]!.adjClose);

  function trend(key: TrendFactorKey, params: ColumnParams): Cell {
    const asOf = resolveAsOfDate(params.asOf, ctx.today);
    if (!trendMemo.has(asOf)) {
      series ??= toTechSeries(bars);
      trendMemo.set(asOf, series.times.length ? computeTechnicalFactors(series, isoToSec(asOf), ctx.benchmark) : null);
    }
    const res = trendMemo.get(asOf);
    if (!res) return { v: null, s: "noPrice", p: asOf };
    const v = res.values[key];
    const i = freshIndex(asOf);
    return v == null ? { v: null, s: "noValue", p: asOf } : ok(v, i >= 0 ? secToIso(bars[i]!.time) : asOf);
  }

  function priceCell(field: PriceField, params: ColumnParams): Cell {
    if (field === "close") {
      const asOf = resolveAsOfDate(params.asOf, ctx.today);
      const i = freshIndex(asOf);
      if (i < 0) return { v: null, s: "noPrice", p: asOf };
      return ok(priceAt(i, params.adjust), secToIso(bars[i]!.time));
    }
    const { from, to } = resolveRangeDates(params.range, ctx.today);
    const end = freshIndex(to);
    if (end < 0) return { v: null, s: "noPrice", p: `${from} 至 ${to}` };
    const fromSec = isoToSec(from);
    const first = bars.findIndex((b) => b.time >= fromSec);
    if (first < 0 || first > end) return { v: null, s: "noPrice", p: `${from} 至 ${to}` };
    const label = `${secToIso(bars[first]!.time)} 至 ${secToIso(bars[end]!.time)}`;

    if (field === "rangeReturn") {
      // 区间开始前一交易日的收盘为基准；区间内才上市的，以上市首日收盘为基准
      const base = first > 0 ? first - 1 : first;
      const v = priceAt(end, params.adjust) / priceAt(base, params.adjust) - 1;
      return ok(v, base === first ? `${label}（上市以来）` : label);
    }

    let amount = 0;
    let volume = 0;
    for (let k = first; k <= end; k++) {
      const vol = bars[k]!.volume;
      if (vol == null || !Number.isFinite(vol) || vol < 0) continue;
      // 库内收盘价与成交量同为拆股调整后口径，相乘即当日名义成交额
      amount += bars[k]!.close * vol;
      volume += vol;
    }
    if (field === "rangeAmount") return ok(amount, label);

    const pit = input.pitByDate.get(to);
    if (input.isFund) return { v: null, s: "notApplicable" };
    if (!pit?.quarters.length) return { v: null, s: "uncovered" };
    // 股本已归一到最新拆股刻度，与库内成交量同口径
    const shares = pit.sharesCurrent;
    return shares && shares > 0 ? ok(volume / shares, label) : { v: null, s: "noValue", p: label };
  }

  function valuation(field: ValuationField, params: ColumnParams): Cell {
    if (input.isFund) return { v: null, s: "notApplicable" };
    const asOf = resolveAsOfDate(params.asOf, ctx.today);
    const pit = input.pitByDate.get(asOf);
    if (!pit?.quarters.length) return { v: null, s: "uncovered" };
    const label = pit.closeDate ?? asOf;
    if (pit.close == null) return { v: null, s: "noPrice", p: asOf };
    if (field === "marketCap") return pit.marketCap != null ? ok(pit.marketCap, label) : { v: null, s: "noValue", p: label };

    if (!fundMemo.has(asOf)) fundMemo.set(asOf, computeFundamentalFactors(pit, asOf));
    const f = fundMemo.get(asOf)!;
    const inverse = (key: string): Cell => {
      const y = f[key];
      return y == null || y === 0 ? { v: null, s: "noValue", p: label } : ok(1 / y, label);
    };
    const direct = (key: string): Cell => (f[key] == null ? { v: null, s: "noValue", p: label } : ok(f[key]!, label));
    switch (field) {
      case "pe": return inverse("earningsYield");
      case "pb": return inverse("bookYield");
      case "ps": return inverse("salesYield");
      case "evToOcf": return inverse("ocfToEv");
      default: return direct(field);
    }
  }

  return { trend, priceCell, valuation };
}

export type MarketResolver = ReturnType<typeof createMarketResolver>;
