/**
 * Industry 等权篮子收益与个股区间涨跌。
 */

import { BENCHMARK_ETF } from "@/lib/equity/gicsCatalog";
import { getDailyClosesDbFirst } from "@/lib/equity/equityPriceStore";
import { simpleReturn, type ClosePoint } from "@/lib/equity/sectorReturns";

export type SymbolReturnRow = {
  symbol: string;
  absoluteReturn: number | null;
  excessVsSpy: number | null;
};

export type IndustryBasketReturn = {
  industryCode: string;
  equalWeightReturn: number | null;
  excessVsSpy: number | null;
  spyReturn: number | null;
  coverage: number;
  memberCount: number;
  missingSymbols: string[];
  priceSource: string | null;
};

function meanFinite(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function computeEqualWeightBasketReturn(
  closes: Record<string, ClosePoint[]>,
  symbols: string[],
  fromSec: number,
  toSec: number,
  spyCloses: ClosePoint[],
): Omit<IndustryBasketReturn, "industryCode" | "priceSource"> {
  const spyReturn = simpleReturn(spyCloses, fromSec, toSec);
  const absReturns: (number | null)[] = [];
  const missingSymbols: string[] = [];

  for (const symbol of symbols) {
    const pts = closes[symbol];
    if (!pts || pts.length < 2) {
      missingSymbols.push(symbol);
      continue;
    }
    absReturns.push(simpleReturn(pts, fromSec, toSec));
  }

  const equalWeightReturn = meanFinite(absReturns);
  const excessVsSpy =
    equalWeightReturn != null && spyReturn != null ? equalWeightReturn - spyReturn : null;

  return {
    equalWeightReturn,
    excessVsSpy,
    spyReturn,
    coverage: symbols.length > 0 ? (symbols.length - missingSymbols.length) / symbols.length : 0,
    memberCount: symbols.length,
    missingSymbols,
  };
}

export function computeSymbolReturns(
  closes: Record<string, ClosePoint[]>,
  symbols: string[],
  fromSec: number,
  toSec: number,
  spyReturn: number | null,
): SymbolReturnRow[] {
  return symbols.map((symbol) => {
    const pts = closes[symbol];
    const absoluteReturn = pts ? simpleReturn(pts, fromSec, toSec) : null;
    const excessVsSpy =
      absoluteReturn != null && spyReturn != null ? absoluteReturn - spyReturn : null;
    return { symbol, absoluteReturn, excessVsSpy };
  });
}

export async function fetchIndustryReturns(
  symbols: string[],
  fromSec: number,
  toSec: number,
  industryCode: string,
  limit = 320,
): Promise<IndustryBasketReturn> {
  const allSymbols = [...new Set([...symbols, BENCHMARK_ETF])];
  const { closes, source, missing } = await getDailyClosesDbFirst(allSymbols, limit);
  const basket = computeEqualWeightBasketReturn(
    closes,
    symbols,
    fromSec,
    toSec,
    closes[BENCHMARK_ETF] ?? [],
  );

  return {
    industryCode,
    ...basket,
    missingSymbols: [
      ...new Set([...basket.missingSymbols, ...missing.filter((s) => s !== BENCHMARK_ETF)]),
    ],
    priceSource: source,
  };
}

/** 同一 Sector 内多 Industry：标的行情只拉一次 */
export async function fetchIndustryReturnsBatch(
  groups: { industryCode: string; symbols: string[] }[],
  fromSec: number,
  toSec: number,
  limit = 320,
): Promise<IndustryBasketReturn[]> {
  const allSymbols = [
    ...new Set([...groups.flatMap((g) => g.symbols), BENCHMARK_ETF]),
  ];
  const { closes, source } = await getDailyClosesDbFirst(allSymbols, limit);
  const spyPts = closes[BENCHMARK_ETF] ?? [];

  return groups.map(({ industryCode, symbols }) => {
    const basket = computeEqualWeightBasketReturn(closes, symbols, fromSec, toSec, spyPts);
    return { industryCode, ...basket, priceSource: source };
  });
}
