/**
 * 个股相对强弱：vs SPY / vs Sector ETF / vs Industry 等权篮子。
 * 纯函数；行情由调用方（equityPriceStore）提供。
 */

import { simpleReturn, type ClosePoint } from "@/lib/equity/sectorReturns";

/**
 * 逐日等权净值（起点=100）：各成分按区间首个收盘归一后取当日均值。
 * 当日缺数据的成分不计入当日均值（S&P500 成分缺口极少，MVP 可接受）。
 */
export function buildEqualWeightNavPoints(
  closes: Record<string, ClosePoint[]>,
  symbols: string[],
  fromSec: number,
): ClosePoint[] {
  const perSymbol: { base: number; byDay: Map<number, number> }[] = [];
  const daySet = new Set<number>();

  for (const symbol of symbols) {
    const pts = (closes[symbol] ?? [])
      .filter((p) => p.time >= fromSec && Number.isFinite(p.close))
      .sort((a, b) => a.time - b.time);
    if (pts.length < 2) continue;
    const base = pts[0]!.close;
    if (!base) continue;
    const byDay = new Map<number, number>();
    for (const p of pts) {
      byDay.set(p.time, p.close);
      daySet.add(p.time);
    }
    perSymbol.push({ base, byDay });
  }

  if (perSymbol.length === 0) return [];

  const days = [...daySet].sort((a, b) => a - b);
  const out: ClosePoint[] = [];
  for (const day of days) {
    let sum = 0;
    let n = 0;
    for (const s of perSymbol) {
      const c = s.byDay.get(day);
      if (c == null) continue;
      sum += c / s.base;
      n += 1;
    }
    if (n === 0) continue;
    out.push({ time: day, close: (sum / n) * 100 });
  }
  return out;
}

/**
 * 相对强弱（RS）线：以两序列共同交易日为准，(个股/个股基期) ÷ (基准/基准基期) × 100。
 */
export function computeRelativeSeries(
  stock: ClosePoint[],
  benchmark: ClosePoint[],
  fromSec: number,
): { time: number; value: number }[] {
  const benchByDay = new Map(
    benchmark
      .filter((p) => p.time >= fromSec && Number.isFinite(p.close) && p.close !== 0)
      .map((p) => [p.time, p.close] as const),
  );
  const common = stock
    .filter(
      (p) =>
        p.time >= fromSec && Number.isFinite(p.close) && p.close !== 0 && benchByDay.has(p.time),
    )
    .sort((a, b) => a.time - b.time);
  if (common.length === 0) return [];

  const stockBase = common[0]!.close;
  const benchBase = benchByDay.get(common[0]!.time)!;
  if (!stockBase || !benchBase) return [];

  return common.map((p) => ({
    time: p.time,
    value: (p.close / stockBase / (benchByDay.get(p.time)! / benchBase)) * 100,
  }));
}

export type SymbolReturnVsBaskets = {
  symbol: string;
  absoluteReturn: number | null;
  excessVsSpy: number | null;
  excessVsSectorEtf: number | null;
  excessVsIndustry: number | null;
};

/**
 * 个股区间收益及相对 SPY / Sector ETF / Industry 等权篮子的超额。
 * 基准传 null 表示不计算该项超额。
 */
export function computeSymbolReturnsVsBaskets(
  closes: Record<string, ClosePoint[]>,
  symbols: string[],
  fromSec: number,
  toSec: number,
  benchmarks: {
    spyCloses?: ClosePoint[] | null;
    sectorEtfCloses?: ClosePoint[] | null;
    industryNav?: ClosePoint[] | null;
  },
): SymbolReturnVsBaskets[] {
  const spyReturn = benchmarks.spyCloses
    ? simpleReturn(benchmarks.spyCloses, fromSec, toSec)
    : null;
  const sectorReturn = benchmarks.sectorEtfCloses
    ? simpleReturn(benchmarks.sectorEtfCloses, fromSec, toSec)
    : null;
  const industryReturn = benchmarks.industryNav
    ? simpleReturn(benchmarks.industryNav, fromSec, toSec)
    : null;

  return symbols.map((symbol) => {
    const abs = closes[symbol] ? simpleReturn(closes[symbol]!, fromSec, toSec) : null;
    const excess = (bench: number | null) => (abs != null && bench != null ? abs - bench : null);
    return {
      symbol,
      absoluteReturn: abs,
      excessVsSpy: excess(spyReturn),
      excessVsSectorEtf: excess(sectorReturn),
      excessVsIndustry: excess(industryReturn),
    };
  });
}
