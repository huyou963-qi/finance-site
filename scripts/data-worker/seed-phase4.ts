/**
 * Phase 4：jpov/chov xlsx 订阅
 *
 * npm run data:seed-phase4
 * npm run data:seed-phase4 -- --dry-run
 * npm run data:seed-phase4 -- --overview-only
 */
import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  InstrumentKind,
  PrismaClient,
} from "@prisma/client";
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";
import {
  PHASE4_DATA_SOURCES,
  granularityForInstrument,
  releaseRuleForOverview,
} from "../../src/lib/data/scheduler/phase4SeedCatalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function upsertDataSource(
  ds: (typeof PHASE4_DATA_SOURCES)[keyof typeof PHASE4_DATA_SOURCES],
  dryRun: boolean,
) {
  if (dryRun) return;
  await prisma.dataSource.upsert({
    where: { id: ds.id },
    create: {
      id: ds.id,
      agencyId: ds.agencyId,
      name: ds.name,
      adapterKind: ds.adapterKind,
      baseUrl: ds.baseUrl,
      termsUrl: ds.termsUrl,
      rateLimit: ds.rateLimit,
      metadata: ds.metadata,
    },
    update: {
      name: ds.name,
      adapterKind: ds.adapterKind,
      rateLimit: ds.rateLimit,
      metadata: ds.metadata,
    },
  });
}

async function seedOverviewPrefix(
  prefix: "chov_" | "jpov_",
  sourceId: "overview-china" | "overview-japan",
  dryRun: boolean,
) {
  const instruments = await prisma.instrument.findMany({
    where: { kind: InstrumentKind.MACRO_SERIES, code: { startsWith: prefix } },
    orderBy: { code: "asc" },
    select: { id: true, code: true, freqLabel: true, dataSubscription: { select: { id: true } } },
  });

  let created = 0;
  let skipped = 0;
  for (const inst of instruments) {
    if (inst.dataSubscription) {
      skipped++;
      continue;
    }
    const rule = releaseRuleForOverview(inst.freqLabel);
    const nextRunAt = computeNextRunAt(rule, new Date());
    const granularity = granularityForInstrument(inst.freqLabel);

    if (dryRun) {
      console.log(`  + ${inst.code}`);
      created++;
      continue;
    }

    await prisma.dataSubscription.create({
      data: {
        instrumentId: inst.id,
        sourceId,
        sourceSeriesKey: inst.code,
        fetchMethod: DataFetchMethod.BULK_DOWNLOAD,
        granularity,
        releaseRule: rule,
        nextRunAt,
        enabled: true,
        priority: 5,
      },
    });
    created++;
  }
  return { created, skipped, total: instruments.length };
}

async function main() {
  const dryRun = argFlag("dry-run");

  console.log(`[seed-phase4] Phase 4 订阅${dryRun ? "（dry-run）" : ""}…`);

  await upsertDataSource(PHASE4_DATA_SOURCES["overview-china"], dryRun);
  await upsertDataSource(PHASE4_DATA_SOURCES["overview-japan"], dryRun);
  const cn = await seedOverviewPrefix("chov_", "overview-china", dryRun);
  const jp = await seedOverviewPrefix("jpov_", "overview-japan", dryRun);
  console.log(`[seed-phase4] chov 新增 ${cn.created} 跳过 ${cn.skipped} / ${cn.total}；jpov 新增 ${jp.created} 跳过 ${jp.skipped} / ${jp.total}`);

  if (!dryRun) {
    const counts = await prisma.dataSubscription.groupBy({
      by: ["sourceId"],
      _count: true,
      where: {
        sourceId: { in: ["overview-china", "overview-japan"] },
      },
    });
    for (const row of counts) {
      console.log(`  ${row.sourceId}: ${row._count}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
