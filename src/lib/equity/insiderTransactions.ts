/**
 * 个股内部人交易读取层（Form 4 Table I，资金侧三角验证第三块拼图）。
 * 纯 DB 读取，不做 lazy on-demand 抓取——Form 4 走批量后台同步（npm run quant:sync-form4），
 * 不像 fundamentals 那样适合按需拉取单只股票（申报量大、逐份还要再拉 XML）。
 */
import { prisma } from "@/lib/prisma";

export type InsiderTransactionRow = {
  accession: string;
  filerCik: string;
  filerName: string | null;
  isDirector: boolean;
  isOfficer: boolean;
  isTenPercentOwner: boolean;
  officerTitle: string | null;
  transactionDate: string;
  transactionCode: string;
  acquiredDisposedCode: string;
  shares: number;
  pricePerShare: number | null;
  sharesOwnedAfter: number | null;
  filedAt: string;
};

export type InsiderMonthlyNet = {
  month: string; // YYYY-MM
  buyShares: number;
  sellShares: number;
  buyValue: number;
  sellValue: number;
  netValue: number;
};

export type InsiderTransactionsResult = {
  transactions: InsiderTransactionRow[];
  monthly: InsiderMonthlyNet[];
};

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function loadInsiderTransactions(
  symbol: string,
  opts: { limit?: number } = {},
): Promise<InsiderTransactionsResult> {
  const limit = Math.max(1, Math.min(opts.limit ?? 200, 1000));
  const rows = await prisma.insiderTransaction.findMany({
    where: { symbol },
    orderBy: [{ transactionDate: "desc" }, { filedAt: "desc" }],
    take: limit,
  });

  const transactions: InsiderTransactionRow[] = rows.map((r) => ({
    accession: r.accession,
    filerCik: r.filerCik,
    filerName: r.filerName,
    isDirector: r.isDirector,
    isOfficer: r.isOfficer,
    isTenPercentOwner: r.isTenPercentOwner,
    officerTitle: r.officerTitle,
    transactionDate: toIsoDate(r.transactionDate),
    transactionCode: r.transactionCode,
    acquiredDisposedCode: r.acquiredDisposedCode,
    shares: r.shares,
    pricePerShare: r.pricePerShare,
    sharesOwnedAfter: r.sharesOwnedAfter,
    filedAt: toIsoDate(r.filedAt),
  }));

  const monthlyMap = new Map<string, InsiderMonthlyNet>();
  for (const t of transactions) {
    const month = t.transactionDate.slice(0, 7);
    let m = monthlyMap.get(month);
    if (!m) {
      m = { month, buyShares: 0, sellShares: 0, buyValue: 0, sellValue: 0, netValue: 0 };
      monthlyMap.set(month, m);
    }
    const value = t.shares * (t.pricePerShare ?? 0);
    // P=公开市场买入 S=公开市场卖出；其余代码（授予/行权/代扣等）不计入净买卖趋势
    if (t.transactionCode === "P") {
      m.buyShares += t.shares;
      m.buyValue += value;
    } else if (t.transactionCode === "S") {
      m.sellShares += t.shares;
      m.sellValue += value;
    }
  }
  for (const m of monthlyMap.values()) m.netValue = m.buyValue - m.sellValue;
  const monthly = [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  return { transactions, monthly };
}
