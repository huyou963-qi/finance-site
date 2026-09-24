import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { fetchUsTradeDetail } from "../../src/lib/data/scheduler/usTradeDetail/client";
import { US_TRADE_PACKAGE_ID, US_TRADE_SOURCE_ID, usTradePlacement } from "../../src/lib/data/scheduler/usTradeDetail/catalog";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const source = await fetchUsTradeDetail();
  assert(source.length >= 750, `Expected at least 750 Census trade series, got ${source.length}`);
  const groups = new Map<string, number>();
  for (const row of source) {
    assert.equal(row.subgroup, usTradePlacement(row.code));
    assert(row.points.length > 0, row.code);
    groups.set(row.subgroup, (groups.get(row.subgroup) ?? 0) + 1);
  }
  for (const [name, count] of groups) assert(count <= 48, `${name} leaf has ${count} items`);
  if (!process.argv.includes("--db")) return void console.log(`[verify-us-trade-detail] source=${source.length} leafGroups=${groups.size}`);
  const instruments = await prisma.instrument.findMany({
    where: { code: { startsWith: "census_us_trade_" } },
    include: { dataSubscription: true, releasePackageMembers: true },
  });
  const byCode = new Map(instruments.map((row) => [row.code, row]));
  for (const series of source) {
    const instrument = byCode.get(series.code);
    assert(instrument, `Missing instrument ${series.code}`);
    const metadata = instrument.metadata as Record<string, unknown>;
    assert.equal(metadata.catalogSubcategory, series.subgroup);
    assert.equal(instrument.dataSubscription?.sourceId, US_TRADE_SOURCE_ID);
    assert.equal(instrument.dataSubscription?.enabled, true);
    assert.equal(instrument.dataSubscription?.releasePackageId, US_TRADE_PACKAGE_ID);
    assert.equal((instrument.dataSubscription?.releaseRule as { type?: string } | null)?.type, "economic_calendar");
    assert(instrument.dataSubscription?.nextRunAt, `Missing nextRunAt ${series.code}`);
    assert(instrument.releasePackageMembers.some((member) => member.packageId === US_TRADE_PACKAGE_ID), `Missing package member ${series.code}`);
    const aggregate = await prisma.macroObservation.aggregate({ where: { instrumentId: instrument.id }, _count: true, _min: { obsDate: true }, _max: { obsDate: true } });
    assert.equal(aggregate._count, series.points.length, `Historical depth mismatch ${series.code}`);
    assert.equal(aggregate._min.obsDate?.toISOString().slice(0, 10), series.points[0]!.obsDate.toISOString().slice(0, 10));
    const observation = await prisma.macroObservation.findFirst({ where: { instrumentId: instrument.id }, orderBy: { obsDate: "desc" } });
    assert(observation, `Missing observation ${series.code}`);
    assert.equal(observation.obsDate.toISOString().slice(0, 10), series.points.at(-1)!.obsDate.toISOString().slice(0, 10));
    assert(Math.abs(observation.value - series.points.at(-1)!.value) < 0.000001, `Latest value mismatch ${series.code}`);
  }
  console.log(`[verify-us-trade-detail] passed instruments=${instruments.length} source=${source.length} leafGroups=${groups.size}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
