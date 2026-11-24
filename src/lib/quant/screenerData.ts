/**
 * 选股器数据装配层（Phase 2）：FactorSnapshot 截面读取 + 引擎编排。
 * 纯函数引擎在 screener.ts；本模块负责触库，供 API 路由调用。
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  pivotFactorRows,
  runScreener,
  type FactorLongRow,
  type ScreenerConfig,
  type ScreenerRunResult,
  type SecurityMeta,
} from "@/lib/quant/screener";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 全部可选截面日（升序）；来源 = FactorSnapshot 实际落库日期（≈321 期） */
export async function listFactorDates(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ date: Date }[]>`
    SELECT DISTINCT date FROM mds.factor_snapshot ORDER BY date ASC
  `;
  return rows.map((r) => iso(r.date));
}

/** 解析截面日：≤ 请求日的最近落库日；缺省 = 最新期。库空 / 早于首期 → null */
export async function resolveFactorDate(date?: string | null, db: Prisma.TransactionClient = prisma): Promise<string | null> {
  const row = await db.factorSnapshot.findFirst({
    where: date ? { date: { lte: new Date(`${date}T00:00:00.000Z`) } } : {},
    orderBy: { date: "desc" },
    select: { date: true },
  });
  return row ? iso(row.date) : null;
}

/** 单日全截面长表 + 证券元信息（现值 GICS；含退市成员，Phase 1 WS3 已回填 name） */
export async function loadFactorCrossSection(date: string, db: Prisma.TransactionClient = prisma, maxRows?: number): Promise<{
  longRows: FactorLongRow[];
  metaBySymbol: Map<string, SecurityMeta>;
}> {
  const snaps = await db.factorSnapshot.findMany({
    where: { date: new Date(`${date}T00:00:00.000Z`) },
    take: maxRows === undefined ? undefined : maxRows + 1,
    select: { symbol: true, factorKey: true, value: true, zscore: true, sectorZscore: true },
  });
  if (maxRows !== undefined && snaps.length > maxRows) throw new Error("因子截面超出本次查询范围");
  const symbols = [...new Set(snaps.map((s) => s.symbol))];
  const securities = await db.equitySecurity.findMany({
    where: { symbol: { in: symbols } },
    select: { symbol: true, name: true, gicsSector: true },
  });
  const metaBySymbol = new Map<string, SecurityMeta>(
    securities.map((s) => [s.symbol, { name: s.name, sector: s.gicsSector }]),
  );
  return {
    longRows: snaps.map((s) => ({
      symbol: s.symbol,
      factorKey: s.factorKey,
      value: s.value,
      zscore: s.zscore,
      sectorZscore: s.sectorZscore,
    })),
    metaBySymbol,
  };
}

export type SectorContextRow = {
  factorKey: string;
  median: number;
  p25: number;
  p75: number;
  coverage: number;
  sampleCount: number;
};

/** 选中单一 sector 时的行业中位数上下文（FactorSectorSnapshot） */
export async function loadSectorContext(
  sector: string,
  date: string,
  db: Prisma.TransactionClient = prisma,
): Promise<SectorContextRow[]> {
  const rows = await db.factorSectorSnapshot.findMany({
    where: { sector, date: new Date(`${date}T00:00:00.000Z`) },
    select: { factorKey: true, median: true, p25: true, p75: true, coverage: true, sampleCount: true },
  });
  return rows;
}

export type ScreenerQueryResult = ScreenerRunResult & {
  /** 实际使用的截面日（≤ 请求日的最近落库日） */
  date: string;
  /** 截面 symbol 总数（= stats.universeTotal，冗余方便前端） */
  sectorContext: { sector: string; rows: SectorContextRow[] } | null;
};

/**
 * 按配置执行一次选股查询。date 解析失败（库空/早于首期）抛错。
 * universe.sectors 恰好单选时附带该行业的因子中位数上下文。
 */
export async function runScreenerQuery(config: ScreenerConfig, db: Prisma.TransactionClient = prisma, maxRows?: number): Promise<ScreenerQueryResult> {
  const date = await resolveFactorDate(config.date, db);
  if (!date) throw new Error(`无可用因子截面（请求日期：${config.date ?? "最新"}）`);

  const { longRows, metaBySymbol } = await loadFactorCrossSection(date, db, maxRows);
  const rows = pivotFactorRows(longRows, metaBySymbol);
  const result = runScreener(rows, config);

  const singleSector =
    config.universe?.sectors?.length === 1 ? config.universe.sectors[0]! : null;
  const sectorContext = singleSector
    ? { sector: singleSector, rows: await loadSectorContext(singleSector, date, db) }
    : null;

  return { ...result, date, sectorContext };
}
