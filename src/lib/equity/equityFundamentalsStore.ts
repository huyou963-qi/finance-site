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
import { Prisma } from "@prisma/client";
import { readStatementLines, type StatementLines } from "./statementTemplate";
import { planQuarterlyWrite, quarterlyWriteWindow } from "./quarterlyWritePlan";

export async function upsertQuarterlyFundamentals(
  symbol: string,
  rows: SecQuarterlyFundamentals[],
  opts: { fillMissing?: boolean } = {},
): Promise<number> {
  if (!rows.length) return 0;
  const window = quarterlyWriteWindow(rows);
  const attempt = () => prisma.$transaction(async tx => {
    const existing = await tx.equityFundamentalSnapshot.findMany({
      where: { symbol, periodType: "Q", period: window }, take: 103,
    });
    if (existing.length >= 103) throw new Error("既有季度记录超出有界迁移范围");
    const plan = planQuarterlyWrite(rows, existing, opts.fillMissing);
    const n = await writeQuarterRows(tx, symbol, plan.rows);
    for (const old of plan.obsolete) {
      const removed = await tx.equityFundamentalSnapshot.deleteMany({ where: {
        symbol, periodType: "Q", period: old.period, fiscalDate: new Date(`${old.fiscalDate}T00:00:00Z`),
      } });
      if (removed.count !== 1) throw new Error("财季迁移遇到并发修改，事务已回滚");
    }
    return n;
  }, { timeout: 30000, maxWait: 5000, isolationLevel: "Serializable" });
  return retrySerializationFailure(attempt);
}

/**
 * Serializable 事务在并发写入（日批与回填、或多进程回填）时会被数据库拒绝并要求重试（Prisma P2034）。
 * 整个事务重新执行：重新读取库内现值、重新规划，因此合并语义不变。其他错误立即抛出。
 */
export async function retrySerializationFailure<T>(run: () => Promise<T>, attempts = 5, pause = (ms: number) => new Promise(r => setTimeout(r, ms))): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await run();
    } catch (error) {
      if ((error as { code?: string })?.code !== "P2034" || i >= attempts) throw error;
      await pause(100 * 2 ** i + Math.floor(Math.random() * 200));
    }
  }
}

async function writeQuarterRows(
  client: Pick<Prisma.TransactionClient, "equityFundamentalSnapshot">,
  symbol: string, rows: SecQuarterlyFundamentals[],
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
      buybackPaid: r.buybackPaid,
      fiscalDate,
      // PIT：该季数据首次披露日（详见 SecQuarterlyFundamentals.firstReportedAt）
      firstReportedAt: r.firstReportedAt
        ? new Date(`${r.firstReportedAt}T00:00:00.000Z`)
        : null,
      asOf: fiscalDate,
      // undefined = 调用方没有科目明细，不动库内 lines；空对象写 NULL。
      ...(r.lines === undefined ? {} : { lines: Object.keys(r.lines).length ? r.lines : Prisma.DbNull }),
    };
    await client.equityFundamentalSnapshot.upsert({
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
  /** PIT：该季事实首次披露日 YYYY-MM-DD（无则 null） */
  firstReportedAt: string | null;
  /** 三张报表其余标准化科目（同业等手工构造的行可省略） */
  lines?: StatementLines;
};

function toRow(r: {
  period: string;
  fiscalDate: Date | null;
  fiscalQuarter: number | null;
  asOf: Date;
  firstReportedAt?: Date | null;
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
  buybackPaid: number | null;
  lines?: unknown;
}): QuarterSnapshotRow {
  return {
    period: r.period,
    fiscalDate: (r.fiscalDate ?? r.asOf).toISOString().slice(0, 10),
    fiscalQuarter: r.fiscalQuarter,
    firstReportedAt: r.firstReportedAt
      ? r.firstReportedAt.toISOString().slice(0, 10)
      : null,
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
    buybackPaid: r.buybackPaid,
    totalAssets: r.totalAssets,
    totalLiabilities: r.totalLiabilities,
    equity: r.equity,
    longTermDebt: r.longTermDebt,
    cash: r.cash,
    sharesOutstanding: r.sharesOutstanding,
    lines: readStatementLines(r.lines),
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
