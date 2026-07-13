import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { prisma } from "@/lib/prisma";
import { getDailyClosesDbFirst } from "@/lib/equity/equityPriceStore";
import { computeQuarterRatios } from "@/lib/equity/fundamentalRatios";
import { loadStockContext } from "@/lib/equity/stockDetail";
import { computeTtm } from "@/lib/equity/ttm";
import type { QuarterSnapshotRow } from "@/lib/equity/equityFundamentalsStore";

type Ctx = { params: Promise<{ symbol: string }> };

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

/**
 * 同 Industry 成分逐行对比（Bloomberg RV 风格）。
 * 市值 = 最新收盘 × 最新季股本（价格 db-first，行业页已为成分落过日线），
 * 股本缺失时退回主档缓存市值。
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { symbol: symbolRaw } = await ctx.params;
    const stock = await loadStockContext(symbolRaw);
    if (!stock) {
      return NextResponse.json({ error: "未知标的" }, { status: 404 });
    }
    if (!stock.industry || stock.peerSymbols.length < 2) {
      return NextResponse.json({ industry: null, peers: [] });
    }

    const symbols = stock.peerSymbols.slice(0, MAX_PEERS);
    const [securities, snaps, { closes }] = await Promise.all([
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
      getDailyClosesDbFirst(symbols, 5),
    ]);

    const bySymbol = new Map<string, QuarterSnapshotRow[]>();
    for (const s of snaps) {
      const row: QuarterSnapshotRow = {
        period: s.period,
        fiscalDate: (s.fiscalDate ?? s.asOf).toISOString().slice(0, 10),
        fiscalQuarter: s.fiscalQuarter,
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

      const pts = closes[sym] ?? [];
      const lastClose = pts.length ? pts[pts.length - 1]!.close : null;
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

    return NextResponse.json({
      industry: { nameEn: stock.industry.nameEn, peerCount: stock.peerSymbols.length },
      peers,
    });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
