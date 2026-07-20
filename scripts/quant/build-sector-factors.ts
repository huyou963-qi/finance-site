/**
 * 行业因子月频聚合构建（Phase 1 WS4）。
 *
 * 从 factor_snapshot 按 GICS sector（EquitySecurity 现值近似）聚合出
 * factor_sector_snapshot(sector, date, factorKey, median, p25, p75, coverage, sampleCount)。
 * coverage 分母 = 当月宇宙内归属该 sector 的成分数（含缺因子值的成分）。
 *
 * Usage:
 *   npm run quant:build-sector-factors                  # 增量：补 sector 表缺的月份
 *   npm run quant:build-sector-factors -- --full        # 全量重建
 *   npm run quant:build-sector-factors -- --month=2023-06
 */
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { SP500_INDEX_CODE } from "../../src/lib/equity/equitySecurities";

const INSERT_CHUNK = 1000;

function argFlag(name: string): boolean {
  return process.argv.includes(name);
}
function argValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

async function resolveTargetDates(): Promise<string[]> {
  const all = (
    await prisma.factorSnapshot.findMany({ distinct: ["date"], orderBy: { date: "asc" }, select: { date: true } })
  ).map((r) => iso(r.date));
  if (!all.length) throw new Error("factor_snapshot 为空，先跑 quant:build-factors");

  const month = argValue("--month");
  if (month) {
    const hits = all.filter((d) => d.startsWith(month));
    if (!hits.length) throw new Error(`月份 ${month} 无因子快照`);
    return hits;
  }
  if (argFlag("--full")) return all;
  const done = new Set(
    (
      await prisma.factorSectorSnapshot.findMany({ distinct: ["date"], select: { date: true } })
    ).map((r) => iso(r.date)),
  );
  return all.filter((d) => !done.has(d));
}

async function main() {
  const dates = await resolveTargetDates();
  if (!dates.length) {
    console.log("无待聚合月份");
    return;
  }
  console.log(`目标月份 ${dates.length} 个：${dates[0]} ~ ${dates[dates.length - 1]}`);

  const secRows = await prisma.equitySecurity.findMany({
    where: { gicsSector: { not: null } },
    select: { symbol: true, gicsSector: true },
  });
  const sectorBySymbol = new Map(secRows.map((r) => [r.symbol, r.gicsSector!]));

  let total = 0;
  for (const d of dates) {
    const dDate = new Date(`${d}T00:00:00.000Z`);
    const [members, factorRows] = await Promise.all([
      prisma.indexConstituent.findMany({
        where: { indexCode: SP500_INDEX_CODE, asOfDate: dDate },
        select: { symbol: true },
      }),
      prisma.factorSnapshot.findMany({
        where: { date: dDate },
        select: { symbol: true, factorKey: true, value: true },
      }),
    ]);

    // sector 宇宙分母（当月成分 ∩ 有 GICS 归属）
    const universeCountBySector = new Map<string, number>();
    for (const m of members) {
      const sec = sectorBySymbol.get(m.symbol);
      if (!sec) continue;
      universeCountBySector.set(sec, (universeCountBySector.get(sec) ?? 0) + 1);
    }

    // (sector, factorKey) → values
    const groups = new Map<string, number[]>();
    for (const r of factorRows) {
      const sec = sectorBySymbol.get(r.symbol);
      if (!sec) continue;
      const key = `${sec}|${r.factorKey}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(r.value);
    }

    const values: Prisma.Sql[] = [];
    for (const [key, xs] of groups) {
      const [sector, factorKey] = key.split("|") as [string, string];
      const uniN = universeCountBySector.get(sector) ?? 0;
      if (!uniN || xs.length < 3) continue; // 样本太小的聚合无意义
      const sorted = [...xs].sort((a, b) => a - b);
      values.push(
        Prisma.sql`(${randomUUID()}::uuid, ${sector}, ${dDate}::date, ${factorKey}, ${quantile(sorted, 0.5)}, ${quantile(sorted, 0.25)}, ${quantile(sorted, 0.75)}, ${xs.length / uniN}, ${xs.length}, CURRENT_TIMESTAMP)`,
      );
    }

    await prisma.factorSectorSnapshot.deleteMany({ where: { date: dDate } });
    let written = 0;
    for (let i = 0; i < values.length; i += INSERT_CHUNK) {
      const chunk = values.slice(i, i + INSERT_CHUNK);
      written += await prisma.$executeRaw`
        INSERT INTO "mds"."factor_sector_snapshot"
          ("id", "sector", "date", "factor_key", "median", "p25", "p75", "coverage", "sample_count", "updated_at")
        VALUES ${Prisma.join(chunk)}
        ON CONFLICT ("sector", "date", "factor_key") DO UPDATE SET
          "median" = EXCLUDED."median",
          "p25" = EXCLUDED."p25",
          "p75" = EXCLUDED."p75",
          "coverage" = EXCLUDED."coverage",
          "sample_count" = EXCLUDED."sample_count",
          "updated_at" = CURRENT_TIMESTAMP
      `;
    }
    total += written;
    console.log(`  ${d}：${written} 行`);
  }
  console.log(`完成：${dates.length} 个月，共 ${total} 行`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
