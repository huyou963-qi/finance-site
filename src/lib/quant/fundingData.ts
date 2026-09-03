/**
 * 资金面因子的 DB 装配层（Phase 5 WS2）：读 institutional_holding + equity_split，
 * 把 13F 的「as-reported 股数」归一到现拆股刻度，逐 symbol 聚合成 PeriodAgg。
 * 供 build-factors 基本面 pass 消费（computeFundingFactors）。
 */
import { prisma } from "@/lib/prisma";
import {
  aggregatePeriods,
  MIN_FILER_COVERAGE,
  type FilerHolding,
  type PeriodAgg,
} from "@/lib/quant/fundingFactors";

// Prisma 会把一个批次的每条 13F 持仓实体化为 JS 对象。60 只股票叠加多年
// 历史曾让 3.4 GiB 生产机达到 2 GiB RSS 并触发系统 OOM；小批量确保峰值可控。
const SYMBOL_BATCH = 10;

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
 * WS1 覆盖度门槛（[[p1-13f-coverage-gate-backfill]]）：返回全市场 13F filer 数达 minFilers 的
 * 报告期 ISO 集合（"YYYY-MM-DD"）。稀疏期（摄入不全，仅最大几家机构）不在集合内，
 * computeFundingFactors 据此把该期因子整期置 null，避免有偏值毒化回测/IC/选股。
 * 全表按 period_end 分组数 distinct filer_cik（走 [filerCik, periodEnd] 索引），一次查得。
 */
export async function loadAdequatePeriods(
  minFilers = MIN_FILER_COVERAGE,
): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ period_end: Date; n: bigint }[]>`
    SELECT period_end, COUNT(DISTINCT filer_cik) AS n
    FROM mds.institutional_holding
    GROUP BY period_end
  `;
  const adequate = new Set<string>();
  for (const r of rows) {
    if (Number(r.n) >= minFilers) adequate.add(r.period_end.toISOString().slice(0, 10));
  }
  return adequate;
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
        // 必须显式定序：HHI/合计持股是浮点累加，行序不同会在末位产生 1e-16 级差异，
        // 经截面 zscore 放大到 1e-8，让 verify-factors D 段「增量 == 全量」逐行比对失败。
        // 无 orderBy 时 Postgres 不保证跨次返回同一物理顺序。
        orderBy: [{ symbol: "asc" }, { periodEnd: "asc" }, { filerCik: "asc" }],
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
