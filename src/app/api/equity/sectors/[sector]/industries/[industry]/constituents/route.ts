import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import {
  listConstituentsByIndustry,
  resolveIndustryParam,
  resolveSectorParam,
} from "@/lib/equity/equitySecurities";
import { BENCHMARK_ETF, getSectorDef } from "@/lib/equity/gicsCatalog";
import { getIndustryStyle } from "@/lib/equity/gicsIndustryCatalog";
import {
  computeSymbolReturns,
  fetchIndustryReturns,
} from "@/lib/equity/industryReturns";
import { getDailyClosesDbFirst, getLatestClosesDbOnly } from "@/lib/equity/equityPriceStore";
import { parseReturnRange } from "@/lib/equity/returnRangeParams";
import { prisma } from "@/lib/prisma";
import { computeTtm, type QuarterFundamentalRow } from "@/lib/equity/ttm";

type Ctx = { params: Promise<{ sector: string; industry: string }> };

export type ConstituentValuation = {
  latestPeriod: string | null;
  /** 最新季营收同比（估值-成长散点的成长轴） */
  revenueYoY: number | null;
  peTtm: number | null;
  pb: number | null;
  /** 现价×最新季股本；缺价时退回主档缓存市值 */
  marketCap: number | null;
};

/** 成分股 Q 口径估值批量现算（价格只读库，不触发回补——basket 计算已顺带回补过） */
async function computeValuations(
  symbols: string[],
  cachedMcap: Map<string, number | null>,
): Promise<Map<string, ConstituentValuation>> {
  const out = new Map<string, ConstituentValuation>();
  if (!symbols.length) return out;
  const [snaps, closes] = await Promise.all([
    prisma.equityFundamentalSnapshot.findMany({
      where: {
        symbol: { in: symbols },
        periodType: "Q",
        asOf: { gte: new Date(Date.now() - 550 * 86_400_000) },
      },
      orderBy: { asOf: "asc" },
    }),
    getLatestClosesDbOnly(symbols),
  ]);
  const rowsBySymbol = new Map<string, typeof snaps>();
  for (const s of snaps) {
    const arr = rowsBySymbol.get(s.symbol);
    if (arr) arr.push(s);
    else rowsBySymbol.set(s.symbol, [s]);
  }
  for (const [sym, rows] of rowsBySymbol) {
    const latest = rows[rows.length - 1]!;
    const ttmRows: QuarterFundamentalRow[] = rows.map((r) => ({
      period: r.period,
      fiscalDate: (r.fiscalDate ?? r.asOf).toISOString().slice(0, 10),
      revenue: r.revenue,
      netIncome: r.netIncome,
      eps: r.eps,
      ocf: r.ocf,
      capex: r.capex,
      dividendsPaid: r.dividendsPaid,
      totalAssets: r.totalAssets,
      totalLiabilities: r.totalLiabilities,
      equity: r.equity,
      longTermDebt: r.longTermDebt,
      cash: r.cash,
      sharesOutstanding: r.sharesOutstanding,
    }));
    const ttm = computeTtm(ttmRows);
    const close = closes.get(sym) ?? null;
    const mcap =
      close != null && latest.sharesOutstanding != null && latest.sharesOutstanding > 0
        ? close * latest.sharesOutstanding
        : (cachedMcap.get(sym) ?? null);
    out.set(sym, {
      latestPeriod: latest.period,
      revenueYoY: latest.revenueYoY,
      peTtm:
        mcap != null && ttm?.netIncome != null && ttm.netIncome > 0 ? mcap / ttm.netIncome : null,
      pb: mcap != null && latest.equity != null && latest.equity > 0 ? mcap / latest.equity : null,
      marketCap: mcap,
    });
  }
  return out;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { sector: sectorRaw, industry: industryRaw } = await ctx.params;
    const sector = resolveSectorParam(sectorRaw);
    if (!sector) {
      return NextResponse.json({ error: "未知行业" }, { status: 404 });
    }
    const industry = resolveIndustryParam(sector, industryRaw);
    if (!industry) {
      return NextResponse.json({ error: "未知 Industry" }, { status: 404 });
    }

    const limitRaw = req.nextUrl.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const constituents = await listConstituentsByIndustry(sector, industry.code, { limit });
    const def = getSectorDef(sector);

    const fromDate = req.nextUrl.searchParams.get("from")?.trim() || null;
    const toDate = req.nextUrl.searchParams.get("to")?.trim() || null;

    let basket = null;
    let memberReturns: Record<
      string,
      { absoluteReturn: number | null; excessVsSpy: number | null; excessVsIndustry: number | null }
    > = {};

    if (fromDate && toDate) {
      const range = parseReturnRange(fromDate, toDate);
      if ("error" in range) {
        return NextResponse.json({ error: range.error }, { status: 400 });
      }

      const symbols = constituents.map((c) => c.symbol);
      basket = await fetchIndustryReturns(symbols, range.fromSec, range.toSec, industry.code);

      const { closes } = await getDailyClosesDbFirst([...symbols, BENCHMARK_ETF]);
      const rows = computeSymbolReturns(
        closes,
        symbols,
        range.fromSec,
        range.toSec,
        basket.spyReturn,
      );
      const basketReturn = basket.equalWeightReturn;
      memberReturns = Object.fromEntries(
        rows.map((r) => [
          r.symbol,
          {
            absoluteReturn: r.absoluteReturn,
            excessVsSpy: r.excessVsSpy,
            excessVsIndustry:
              r.absoluteReturn != null && basketReturn != null
                ? r.absoluteReturn - basketReturn
                : null,
          },
        ]),
      );
    }

    const valuations = await computeValuations(
      constituents.map((c) => c.symbol),
      new Map(constituents.map((c) => [c.symbol, c.marketCap ?? null])),
    );

    return NextResponse.json({
      sector,
      nameZh: def.nameZh,
      industry: {
        code: industry.code,
        nameEn: industry.nameEn,
        industryGroup: industry.industryGroup,
        style: getIndustryStyle(industry.code),
      },
      range: fromDate && toDate ? { from: fromDate, to: toDate } : null,
      basket,
      constituents: constituents.map((c) => ({
        ...c,
        returns: memberReturns[c.symbol] ?? null,
        valuation: valuations.get(c.symbol) ?? null,
      })),
    });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
