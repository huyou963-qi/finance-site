import { NextRequest, NextResponse } from "next/server";
import { getDailyClosesDbFirst } from "@/lib/equity/equityPriceStore";
import { getQuarterlyFundamentalsDbFirst } from "@/lib/equity/equityFundamentalsStore";
import { computeQuarterRatios } from "@/lib/equity/fundamentalRatios";
import { loadStockContext } from "@/lib/equity/stockDetail";
import { computeValuationHistory } from "@/lib/equity/valuationHistory";
import { prisma } from "@/lib/prisma";
import type { FundamentalMetric } from "@/lib/chart/chartLayers";

const ALL_METRICS: FundamentalMetric[] = [
  "ttmPe",
  "forwardPe",
  "pb",
  "eps",
  "revenue",
  "grossMargin",
  "operatingMargin",
  "netMargin",
];

const VALUATION_HISTORY_DAYS = 1400;

/**
 * GET /api/data/chart-fundamentals?symbol=AAPL&metrics=ttmPe,pb,eps,revenue,grossMargin,operatingMargin,netMargin
 * 轻量投影：供行情图 Layer 使用（不含完整 fundamentals UI 载荷）。
 * forwardPe 不在此返回（走 /api/data/forward-pe）。
 */
export async function GET(req: NextRequest) {
  const symbolRaw = (req.nextUrl.searchParams.get("symbol") ?? "").trim();
  if (!symbolRaw) {
    return NextResponse.json({ error: "缺少 symbol" }, { status: 400 });
  }
  if (!/^[A-Za-z][A-Za-z0-9.-]{0,11}$/.test(symbolRaw)) {
    return NextResponse.json({ error: "非法 symbol" }, { status: 400 });
  }

  const metricsParam = (req.nextUrl.searchParams.get("metrics") ?? "").trim();
  const wanted = new Set<FundamentalMetric>(
    metricsParam
      ? metricsParam
          .split(",")
          .map((s) => s.trim())
          .filter((s): s is FundamentalMetric =>
            (ALL_METRICS as string[]).includes(s),
          )
      : ALL_METRICS.filter((m) => m !== "forwardPe"),
  );
  wanted.delete("forwardPe");
  const includeAvailability = req.nextUrl.searchParams.get("timing") === "available";

  try {
    const stock = await loadStockContext(symbolRaw);
    if (!stock) {
      return NextResponse.json({ error: "未知标的或不支持基本面" }, { status: 404 });
    }

    const rows = await getQuarterlyFundamentalsDbFirst(stock.symbol, {
      quarters: 70,
      lazy: true,
      cik: stock.cik,
    });

    const daily: Record<string, { time: number; value: number }[]> = {};
    const quarterly: Record<string, { fiscalDate: string; value: number }[]> = {};

    const needVal =
      wanted.has("ttmPe") || wanted.has("pb");
    if (needVal && rows.length) {
      const ratios = computeQuarterRatios(rows);
      const { closes } = await getDailyClosesDbFirst(
        [stock.symbol],
        VALUATION_HISTORY_DAYS,
      );
      const pts = closes[stock.symbol] ?? [];
      const hist = computeValuationHistory(
        pts,
        ratios.map((r) => ({
          fiscalDate: r.fiscalDate,
          epsTtm: r.epsTtm,
          bvps: r.bvps,
        })),
        1,
      );
      if (wanted.has("ttmPe")) {
        daily.ttmPe = hist.points
          .filter((p) => p.pe != null)
          .map((p) => ({ time: p.t, value: p.pe! }));
      }
      if (wanted.has("pb")) {
        daily.pb = hist.points
          .filter((p) => p.pb != null)
          .map((p) => ({ time: p.t, value: p.pb! }));
      }
    }

    for (const r of rows) {
      if (wanted.has("eps") && r.eps != null) {
        (quarterly.eps ??= []).push({ fiscalDate: r.fiscalDate, value: r.eps });
      }
      if (wanted.has("revenue") && r.revenue != null) {
        (quarterly.revenue ??= []).push({
          fiscalDate: r.fiscalDate,
          value: r.revenue,
        });
      }
      if (wanted.has("grossMargin") && r.grossMargin != null) {
        (quarterly.grossMargin ??= []).push({
          fiscalDate: r.fiscalDate,
          value: r.grossMargin,
        });
      }
      if (wanted.has("operatingMargin") && r.opMargin != null) {
        (quarterly.operatingMargin ??= []).push({
          fiscalDate: r.fiscalDate,
          value: r.opMargin,
        });
      }
      if (wanted.has("netMargin") && r.revenue && r.netIncome != null) {
        (quarterly.netMargin ??= []).push({
          fiscalDate: r.fiscalDate,
          value: r.netIncome / r.revenue,
        });
      }
    }

    const available: Partial<Record<FundamentalMetric, { time: number; value: number }[]>> = {};
    if (includeAvailability && [...wanted].some(metric => !["ttmPe", "pb"].includes(metric))) {
      const filed = await prisma.equityFundamentalVintage.findMany({
        where: { symbol: stock.symbol, periodType: "Q", fiscalDate: { not: null } },
        orderBy: [{ filedAt: "asc" }, { accession: "asc" }],
        select: { fiscalDate: true, filedAt: true, eps: true, revenue: true, grossMargin: true, opMargin: true, netIncome: true },
      });
      const seen = new Set<string>();
      for (const row of filed) {
        const values = {
          eps: row.eps, revenue: row.revenue, grossMargin: row.grossMargin, operatingMargin: row.opMargin,
          netMargin: row.revenue && row.netIncome != null ? row.netIncome / row.revenue : null,
        };
        for (const metric of Object.keys(values) as (keyof typeof values)[]) {
          const value = values[metric];
          if (!wanted.has(metric) || value == null || !Number.isFinite(value)) continue;
          const key = `${metric}:${row.fiscalDate!.getTime()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          // Filing records are day-precision, so use the next UTC day for chart calculations.
          (available[metric] ??= []).push({ time: row.filedAt.getTime() / 1000 + 86400, value });
        }
      }
    }
    return NextResponse.json({
      symbol: stock.symbol,
      ...(includeAvailability ? { available } : {}),
      daily,
      quarterly,
      attribution: "SEC companyfacts → equity_fundamental_snapshot",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
