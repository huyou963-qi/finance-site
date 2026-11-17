/**
 * 管理员用：美股日线 / 基本面 / EBITDA 披露覆盖汇总（只读）。
 * 口径对齐 scripts/equity/verify-fundamentals-coverage.ts，并额外抽查 lines.ebitda。
 */

import type { PrismaClient } from "@prisma/client";
import { loadFundamentalsCoverage } from "./fundamentalsCoverage";

const STALE_FUNDAMENTAL_DAYS = 200;
const STALE_PRICE_DAYS = 7;

export type EquityCoverageReport = {
  asOf: string;
  fundamentals: {
    universe: number;
    withData: number;
    noData: number;
    stale: number;
    withStatementLines: number;
    sampleNoData: string[];
    sampleStale: { symbol: string; latest: string }[];
  };
  ebitda: {
    /** 覆盖宇宙内、最新季 lines 含 ebitda 键的家数 */
    withLatestEbitda: number;
    /** 覆盖宇宙内任一季出现过 ebitda 的家数 */
    withAnyEbitda: number;
    sampleMissing: string[];
    samplePresent: string[];
    note: string;
  };
  prices: {
    coverageRows: number;
    fullHistory: number;
    notFound: number;
    /** lastDate 距今超过 STALE_PRICE_DAYS，或根本没有 coverage 行 */
    staleOrMissingInUniverse: number;
    sampleStaleOrMissing: string[];
  };
};

function isoDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export async function loadEquityCoverageReport(db: PrismaClient): Promise<EquityCoverageReport> {
  const universe = [...(await loadFundamentalsCoverage(db))].sort();
  const today = Date.now();

  const fundRows = universe.length
    ? await db.$queryRaw<{ symbol: string; quarters: number; latest: Date | null; with_lines: number }[]>`
        select symbol, count(*)::int quarters, max(fiscal_date) latest, count(lines)::int with_lines
        from mds.equity_fundamental_snapshot
        where period_type = 'Q' and symbol = any(${universe})
        group by symbol`
    : [];
  const byFund = new Map(fundRows.map((r) => [r.symbol, r]));

  const noData: string[] = [];
  const stale: { symbol: string; latest: string }[] = [];
  let withData = 0;
  let withStatementLines = 0;
  for (const symbol of universe) {
    const r = byFund.get(symbol);
    if (!r?.latest) {
      noData.push(symbol);
      continue;
    }
    withData++;
    if (r.with_lines) withStatementLines++;
    if ((today - r.latest.getTime()) / 86_400_000 > STALE_FUNDAMENTAL_DAYS) {
      stale.push({ symbol, latest: isoDate(r.latest)! });
    }
  }

  // 先取每家最新一季，再看该季是否有 ebitda（勿在 DISTINCT 前过滤，否则会退化成「历史上有过」）
  const ebitdaLatest = universe.length
    ? await db.$queryRaw<{ symbol: string }[]>`
        with latest as (
          select distinct on (symbol) symbol, lines
          from mds.equity_fundamental_snapshot
          where period_type = 'Q' and symbol = any(${universe})
          order by symbol, fiscal_date desc
        )
        select symbol from latest where lines ? 'ebitda'`
    : [];
  const ebitdaAny = universe.length
    ? await db.$queryRaw<{ symbol: string }[]>`
        select distinct symbol
        from mds.equity_fundamental_snapshot
        where period_type = 'Q' and symbol = any(${universe})
          and lines ? 'ebitda'`
    : [];
  const withLatest = new Set(ebitdaLatest.map((r) => r.symbol));
  const withAny = new Set(ebitdaAny.map((r) => r.symbol));
  const samplePresent = [...withLatest].sort().slice(0, 20);
  const sampleMissing = universe.filter((s) => !withLatest.has(s)).slice(0, 20);

  const priceRows = await db.equityPriceCoverage.findMany({
    select: { symbol: true, lastDate: true, fullHistory: true, notFound: true },
  });
  const byPrice = new Map(priceRows.map((r) => [r.symbol.toUpperCase(), r]));
  const stalePrice: string[] = [];
  for (const symbol of universe) {
    const row = byPrice.get(symbol.toUpperCase());
    if (!row || row.notFound || !row.lastDate) {
      stalePrice.push(symbol);
      continue;
    }
    if ((today - row.lastDate.getTime()) / 86_400_000 > STALE_PRICE_DAYS) stalePrice.push(symbol);
  }

  return {
    asOf: new Date().toISOString(),
    fundamentals: {
      universe: universe.length,
      withData,
      noData: noData.length,
      stale: stale.length,
      withStatementLines,
      sampleNoData: noData.slice(0, 20),
      sampleStale: stale.slice(0, 20),
    },
    ebitda: {
      withLatestEbitda: withLatest.size,
      withAnyEbitda: withAny.size,
      sampleMissing,
      samplePresent,
      note: "EBITDA 仅在发行人公开披露对应 XBRL 标签时入库。SEC frames 对白名单标签近年无发行人数据，库内为 0 通常是源端未打标，不是页面或 sync 故障；禁止用营业利润+折旧推算入库。",
    },
    prices: {
      coverageRows: priceRows.length,
      fullHistory: priceRows.filter((r) => r.fullHistory).length,
      notFound: priceRows.filter((r) => r.notFound).length,
      staleOrMissingInUniverse: stalePrice.length,
      sampleStaleOrMissing: stalePrice.slice(0, 20),
    },
  };
}
