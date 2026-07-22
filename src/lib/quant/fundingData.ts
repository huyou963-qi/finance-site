/**
 * 资金面因子的 DB 装配层（Phase 5 WS2）：读 institutional_holding + equity_split，
 * 把 13F 的「as-reported 股数」归一到现拆股刻度，逐 symbol 聚合成 PeriodAgg。
 * 供 build-factors 基本面 pass 消费（computeFundingFactors）。
 */
import { prisma } from "@/lib/prisma";
import {
  aggregatePeriods,
  type FilerHolding,
  type PeriodAgg,
} from "@/lib/quant/fundingFactors";

const SYMBOL_BATCH = 60;

type SplitEvt = { exIso: string; ratio: number };

/** periodEnd 的现刻度乘数 = ∏ ratio(exDate > periodEnd)（升序 splits） */
function splitFactorForPeriod(splits: SplitEvt[], periodEndIso: string): number {
  let f = 1;
  for (const s of splits) {
    if (s.exIso > periodEndIso) f *= s.ratio;
  }
  return f;
}

/**
 * 逐 symbol 载入 13F 持仓并聚合。symbols 为宇宙内且已桥接的 symbol；
 * minPeriodIso 可选下限（跳过更早报告期）。返回 symbol → PeriodAgg[]（升序）。
 */
export async function loadFundingPeriods(
  symbols: string[],
  minPeriodIso?: string,
): Promise<Map<string, PeriodAgg[]>> {
  const uniq = [...new Set(symbols)];
  const result = new Map<string, PeriodAgg[]>();

  for (let i = 0; i < uniq.length; i += SYMBOL_BATCH) {
    const batch = uniq.slice(i, i + SYMBOL_BATCH);

    const [holdings, splits] = await Promise.all([
      prisma.institutionalHolding.findMany({
        where: {
          symbol: { in: batch },
          ...(minPeriodIso ? { periodEnd: { gte: new Date(`${minPeriodIso}T00:00:00.000Z`) } } : {}),
        },
        select: {
          symbol: true, filerCik: true, filedAt: true, periodEnd: true, shares: true, value: true,
        },
      }),
      prisma.equitySplit.findMany({
        where: { symbol: { in: batch } },
        orderBy: [{ symbol: "asc" }, { exDate: "asc" }],
        select: { symbol: true, exDate: true, ratio: true },
      }),
    ]);

    const splitsBySymbol = new Map<string, SplitEvt[]>();
    for (const s of splits) {
      (splitsBySymbol.get(s.symbol) ?? splitsBySymbol.set(s.symbol, []).get(s.symbol)!).push({
        exIso: s.exDate.toISOString().slice(0, 10),
        ratio: s.ratio,
      });
    }

    const bySymbol = new Map<string, FilerHolding[]>();
    for (const h of holdings) {
      if (!h.symbol) continue;
      const periodEndIso = h.periodEnd.toISOString().slice(0, 10);
      const sf = splitFactorForPeriod(splitsBySymbol.get(h.symbol) ?? [], periodEndIso);
      (bySymbol.get(h.symbol) ?? bySymbol.set(h.symbol, []).get(h.symbol)!).push({
        filerCik: h.filerCik,
        filedAtIso: h.filedAt.toISOString().slice(0, 10),
        periodEndIso,
        shares: h.shares * sf, // 归一到现刻度
        value: h.value,
      });
    }

    for (const [sym, rows] of bySymbol) {
      result.set(sym, aggregatePeriods(rows));
    }
  }

  return result;
}
