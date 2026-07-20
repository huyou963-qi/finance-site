/**
 * 季度基本面持久层：SEC companyfacts → mds.equity_fundamental_snapshot(periodType=Q)。
 * 批量脚本（equity:sync-fundamentals --period-type=Q）为主路径；
 * 读取层提供单 symbol 懒回补兜底（DB 无 Q 数据时现场拉一次 SEC）。
 */

import { prisma } from "@/lib/prisma";
import {
  extractQuarterlyFundamentals,
  fetchSecCompanyFacts,
  fetchSecTickerCikMap,
  type SecQuarterlyFundamentals,
} from "@/lib/equity/secFundamentals";
import type { QuarterFundamentalRow } from "@/lib/equity/ttm";

export async function upsertQuarterlyFundamentals(
  symbol: string,
  rows: SecQuarterlyFundamentals[],
): Promise<number> {
  let n = 0;
  for (const r of rows) {
    const fiscalDate = new Date(`${r.fiscalDate}T00:00:00.000Z`);
    const data = {
      periodType: "Q",
      fiscalQuarter: r.fiscalQuarter,
      revenue: r.revenue,
      revenueYoY: r.revenueYoY,
      eps: r.eps,
      epsYoY: r.epsYoY,
      grossMargin: r.grossMargin,
      opMargin: r.opMargin,
      netIncome: r.netIncome,
      ocf: r.ocf,
      capex: r.capex,
      totalAssets: r.totalAssets,
      totalLiabilities: r.totalLiabilities,
      equity: r.equity,
      longTermDebt: r.longTermDebt,
      cash: r.cash,
      sharesOutstanding: r.sharesOutstanding,
      dividendsPaid: r.dividendsPaid,
      fiscalDate,
      // PIT：该季数据首次披露日（详见 SecQuarterlyFundamentals.firstReportedAt）
      firstReportedAt: r.firstReportedAt
        ? new Date(`${r.firstReportedAt}T00:00:00.000Z`)
        : null,
      asOf: fiscalDate,
    };
    await prisma.equityFundamentalSnapshot.upsert({
      where: { symbol_period: { symbol, period: r.period } },
      create: { symbol, period: r.period, ...data },
      update: data,
    });
    n += 1;
  }
  return n;
}

/** 拉 companyfacts 并落库；返回写入的季度数（0 = 无可用季度事实） */
export async function ingestQuarterlyFundamentalsForSymbol(
  symbol: string,
  cik: string,
  opts: { maxQuarters?: number } = {},
): Promise<number> {
  const facts = await fetchSecCompanyFacts(cik);
  const rows = extractQuarterlyFundamentals(facts, { maxQuarters: opts.maxQuarters ?? 24 });
  if (!rows.length) return 0;
  return upsertQuarterlyFundamentals(symbol, rows);
}

export type QuarterSnapshotRow = QuarterFundamentalRow & {
  fiscalQuarter: number | null;
  revenueYoY: number | null;
  epsYoY: number | null;
  grossMargin: number | null;
  opMargin: number | null;
};

function toRow(r: {
  period: string;
  fiscalDate: Date | null;
  fiscalQuarter: number | null;
  asOf: Date;
  revenue: number | null;
  revenueYoY: number | null;
  eps: number | null;
  epsYoY: number | null;
  grossMargin: number | null;
  opMargin: number | null;
  netIncome: number | null;
  ocf: number | null;
  capex: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  equity: number | null;
  longTermDebt: number | null;
  cash: number | null;
  sharesOutstanding: number | null;
  dividendsPaid: number | null;
}): QuarterSnapshotRow {
  return {
    period: r.period,
    fiscalDate: (r.fiscalDate ?? r.asOf).toISOString().slice(0, 10),
    fiscalQuarter: r.fiscalQuarter,
    revenue: r.revenue,
    revenueYoY: r.revenueYoY,
    eps: r.eps,
    epsYoY: r.epsYoY,
    grossMargin: r.grossMargin,
    opMargin: r.opMargin,
    netIncome: r.netIncome,
    ocf: r.ocf,
    capex: r.capex,
    dividendsPaid: r.dividendsPaid,
    totalAssets: r.totalAssets,
    totalLiabilities: r.totalLiabilities,
    equity: r.equity,
    longTermDebt: r.longTermDebt,
    cash: r.cash,
    sharesOutstanding: r.sharesOutstanding,
  };
}

/**
 * db-first 读取季度序列（升序）。lazy=true 且库内为空时，现场从 SEC 回补一次
 * （单 symbol 一次请求，失败静默返回空，不阻塞页面）。
 */
export async function getQuarterlyFundamentalsDbFirst(
  symbol: string,
  opts: { quarters?: number; lazy?: boolean; cik?: string | null } = {},
): Promise<QuarterSnapshotRow[]> {
  const quarters = opts.quarters ?? 20;
  const read = () =>
    prisma.equityFundamentalSnapshot.findMany({
      where: { symbol, periodType: "Q" },
      orderBy: { asOf: "desc" },
      take: quarters,
    });

  let rows = await read();
  if (!rows.length && opts.lazy) {
    try {
      let cik = opts.cik ?? null;
      if (!cik) {
        const map = await fetchSecTickerCikMap();
        cik = map.get(symbol) ?? null;
      }
      if (cik) {
        await ingestQuarterlyFundamentalsForSymbol(symbol, cik);
        rows = await read();
      }
    } catch {
      // SEC 不可达时保持空结果，由 UI 呈现「暂无数据」
    }
  }
  return rows.map(toRow).sort((a, b) => a.fiscalDate.localeCompare(b.fiscalDate));
}
