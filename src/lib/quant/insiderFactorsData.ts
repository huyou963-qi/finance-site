/**
 * 内部人因子的数据加载层（Tier B / DERA）。
 *
 * 在 SQL 侧先按「标的 × filedAt 归月」聚合再取回：有价宇宙内全历史仅约 7.7 万行，
 * 而逐笔取回是 340 万行。build-factors 在低内存机上对每个截面日都是 O(全历史)
 * （见 [[p0-deepen-fundamental-history]]），逐笔取回会直接把它压垮。
 *
 * 定序不是可选项：[[phase1-factor-library]] 记载浮点累加顺序会在末位产生 1e-16 级差异，
 * 经截面 zscore 放大到 1e-8，使 verify-factors 的「增量 == 全量」逐行比对失败。
 * 故 SQL 显式 ORDER BY，JS 侧也按月份升序累加。
 */
import { prisma } from "@/lib/prisma";
import type { InsiderMonthAgg } from "./insiderFactors";

const SYMBOL_BATCH = 500;

type Row = {
  symbol: string;
  month: string;
  buy_shares: number | null;
  sell_shares: number | null;
  buy_filings: bigint | number | null;
  buy_txns: bigint | number | null;
  sell_txns: bigint | number | null;
};

const num = (v: bigint | number | null | undefined) => (v == null ? 0 : Number(v));

/**
 * @param symbols   因子宇宙
 * @param minMonthIso 只取该月及以后的申报（YYYY-MM-01），用于增量构建
 */
export async function loadInsiderMonths(
  symbols: string[],
  minMonthIso?: string,
): Promise<Map<string, InsiderMonthAgg[]>> {
  const uniq = [...new Set(symbols)];
  const result = new Map<string, InsiderMonthAgg[]>();

  for (let i = 0; i < uniq.length; i += SYMBOL_BATCH) {
    const batch = uniq.slice(i, i + SYMBOL_BATCH);
    // anomaly 非空的是申报人客观填错（日期倒挂、股数不可能等），已在摄入端标记；
    // A/F/M 是薪酬机制的机械产物不含主观判断，只取 P/S（AGENTS.md 实测口径）。
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT t.issuer_symbol AS symbol,
              to_char(date_trunc('month', t.filed_at), 'YYYY-MM-01') AS month,
              sum(t.shares) FILTER (WHERE t.transaction_code = 'P') AS buy_shares,
              sum(t.shares) FILTER (WHERE t.transaction_code = 'S') AS sell_shares,
              count(DISTINCT t.accession) FILTER (WHERE t.transaction_code = 'P') AS buy_filings,
              count(*) FILTER (WHERE t.transaction_code = 'P') AS buy_txns,
              count(*) FILTER (WHERE t.transaction_code = 'S') AS sell_txns
         FROM mds.dera_insider_transaction t
        WHERE t.issuer_symbol = ANY($1::text[])
          AND t.anomaly IS NULL
          AND t.transaction_code IN ('P','S')
          AND t.shares > 0
          ${minMonthIso ? "AND t.filed_at >= $2::date" : ""}
        GROUP BY 1, 2
        ORDER BY 1, 2`,
      batch,
      ...(minMonthIso ? [minMonthIso] : []),
    );

    for (const r of rows) {
      const list = result.get(r.symbol) ?? [];
      list.push({
        month: r.month,
        buyShares: r.buy_shares ?? 0,
        sellShares: r.sell_shares ?? 0,
        buyFilings: num(r.buy_filings),
        buyTxns: num(r.buy_txns),
        sellTxns: num(r.sell_txns),
      });
      result.set(r.symbol, list);
    }
  }
  return result;
}
