import { prisma } from "@/lib/prisma";
import { getDailyClosesDbFirst, getLatestClosesDbOnly } from "@/lib/equity/equityPriceStore";
import { computeQuarterRatios } from "@/lib/equity/fundamentalRatios";
import type { StockContext } from "@/lib/equity/stockDetail";
import { computeTtm } from "@/lib/equity/ttm";
import type { QuarterSnapshotRow } from "@/lib/equity/equityFundamentalsStore";

export type PeerRow = {
  symbol: string;
  name: string;
  marketCap: number | null;
  revenueYoY: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  roeTtm: number | null;
  peTtm: number | null;
  pb: number | null;
  psTtm: number | null;
  latestPeriod: string | null;
};

const MAX_PEERS = 40;

export async function loadStockPeers(
  stock: StockContext,
  options: { symbols?: string[]; dbOnly?: boolean } = {},
) {
  if (!stock.industry || stock.peerSymbols.length < 2) {
    return { industry: null, peers: [] };
  }

  const symbols = options.symbols ?? stock.peerSymbols.slice(0, MAX_PEERS);
  const [securities, snaps, closes] = await Promise.all([
    prisma.equitySecurity.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, name: true, marketCap: true },
    }),
    prisma.equityFundamentalSnapshot.findMany({
      where: {
        symbol: { in: symbols },
        periodType: "Q",
        asOf: { gte: new Date(Date.now() - 550 * 86_400_000) },
      },
      orderBy: { asOf: "asc" },
    }),
    options.dbOnly ? getLatestClosesDbOnly(symbols)
        : getDailyClosesDbFirst(symbols, 5).then(({ closes }) =>
          new Map(Object.entries(closes).flatMap(([symbol, points]) => {
            const last = points.at(-1);
            return last ? [[symbol, last.close]] as const : [];
          })),
        ),
  ]);

  const bySymbol = new Map<string, QuarterSnapshotRow[]>();
  for (const s of snaps) {
    const row: QuarterSnapshotRow = {
      period: s.period,
      fiscalDate: (s.fiscalDate ?? s.asOf).toISOString().slice(0, 10),
      fiscalQuarter: s.fiscalQuarter,
      firstReportedAt: s.firstReportedAt
        ? s.firstReportedAt.toISOString().slice(0, 10)
        : null,
      revenue: s.revenue,
      revenueYoY: s.revenueYoY,
      eps: s.eps,
      epsYoY: s.epsYoY,
      grossMargin: s.grossMargin,
      opMargin: s.opMargin,
      netIncome: s.netIncome,
      ocf: s.ocf,
      capex: s.capex,
      dividendsPaid: s.dividendsPaid,
      buybackPaid: s.buybackPaid,
      totalAssets: s.totalAssets,
      totalLiabilities: s.totalLiabilities,
      equity: s.equity,
      longTermDebt: s.longTermDebt,
      cash: s.cash,
      sharesOutstanding: s.sharesOutstanding,
    };
    const arr = bySymbol.get(s.symbol);
    if (arr) arr.push(row);
    else bySymbol.set(s.symbol, [row]);
  }

  const secBySymbol = new Map(securities.map((s) => [s.symbol, s]));
  const peers: PeerRow[] = [];
  for (const sym of symbols) {
    const sec = secBySymbol.get(sym);
    const rows = bySymbol.get(sym) ?? [];
    const latest = rows.length ? rows[rows.length - 1]! : null;
    const ttm = computeTtm(rows);
    const ratios = rows.length ? computeQuarterRatios(rows) : [];
    const lastRatio = ratios.length ? ratios[ratios.length - 1]! : null;

    const lastClose = closes.get(sym) ?? null;
    const shares = latest?.sharesOutstanding ?? null;
    const mcap =
      lastClose != null && shares != null && shares > 0
        ? lastClose * shares
        : (sec?.marketCap ?? null);

    peers.push({
      symbol: sym,
      name: sec?.name ?? sym,
      marketCap: mcap,
      revenueYoY: latest?.revenueYoY ?? null,
      grossMargin: latest?.grossMargin ?? null,
      netMargin:
        latest?.netIncome != null && latest?.revenue != null && latest.revenue !== 0
          ? latest.netIncome / latest.revenue
          : null,
      roeTtm: lastRatio?.roeTtm ?? null,
      peTtm:
        mcap != null && ttm?.netIncome != null && ttm.netIncome > 0
          ? mcap / ttm.netIncome
          : null,
      pb: mcap != null && latest?.equity != null && latest.equity > 0 ? mcap / latest.equity : null,
      psTtm: mcap != null && ttm?.revenue != null && ttm.revenue > 0 ? mcap / ttm.revenue : null,
      latestPeriod: latest?.period ?? null,
    });
  }

  peers.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));

  return {
    industry: { nameEn: stock.industry.nameEn, peerCount: stock.peerSymbols.length },
    peers,
  };
}
