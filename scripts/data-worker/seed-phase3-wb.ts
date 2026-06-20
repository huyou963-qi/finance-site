/**
 * Phase 3：World Bank 全量目录 seed（14 国 × 18 指标，跳过已存在 sched_wb_*）
 *
 * npm run data:seed-phase3-wb
 * npm run data:seed-phase3-wb -- --dry-run
 */
import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import { listWorldBankSeedTargets } from "../../src/lib/data/fredCatalog";
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";
import {
  PHASE2_AGENCIES,
  PHASE2_DATA_SOURCES,
  releaseRuleForPhase2,
} from "../../src/lib/data/scheduler/phase2SeedCatalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function wbInstrumentCode(countryCode: string, indicatorId: string): string {
  return `sched_wb_${countryCode}_${indicatorId.replace(/\./g, "_")}`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`[seed-phase3-wb] World Bank 全量${dryRun ? "（dry-run）" : ""}…`);

  for (const a of PHASE2_AGENCIES) {
    if (a.id !== "intl-wb") continue;
    if (!dryRun) {
      await prisma.statisticalAgency.upsert({
        where: { id: a.id },
        create: a,
        update: { nameZh: a.nameZh, nameEn: a.nameEn ?? null, websiteUrl: a.websiteUrl ?? null },
      });
    }
  }

  const ds = PHASE2_DATA_SOURCES.worldbank;
  if (!dryRun) {
    await prisma.dataSource.upsert({
      where: { id: ds.id },
      create: {
        id: ds.id,
        agencyId: ds.agencyId,
        name: ds.name,
        adapterKind: SourceAdapterKind.WORLD_BANK_API,
        baseUrl: ds.baseUrl,
        termsUrl: ds.termsUrl,
        rateLimit: ds.rateLimit,
      },
      update: {
        name: ds.name,
        adapterKind: SourceAdapterKind.WORLD_BANK_API,
        baseUrl: ds.baseUrl,
        rateLimit: ds.rateLimit,
      },
    });
  }

  const targets = listWorldBankSeedTargets();
  let created = 0;
  let skipped = 0;

  for (const row of targets) {
    const code = wbInstrumentCode(row.countryCode, row.indicatorId);
    const exists = await prisma.dataSubscription.findFirst({
      where: { instrument: { code } },
    });
    if (exists) {
      skipped++;
      continue;
    }

    const wbKey = `${row.countryCode}:${row.indicatorId}`;
    const rule = releaseRuleForPhase2("worldbank", wbKey, "ANNUAL");
    const nextRunAt = computeNextRunAt(rule, new Date());

    if (dryRun) {
      console.log(`  + ${code}`);
      created++;
      continue;
    }

    const instrument = await prisma.instrument.upsert({
      where: { code },
      create: {
        code,
        kind: InstrumentKind.MACRO_SERIES,
        name: `${row.countryCode} ${row.label}`,
        freqLabel: "年",
        externalRefs: {
          catalogKey: `wb:${row.countryCode}:${row.indicatorId}`,
          agencyId: "intl-wb",
          sourceId: "worldbank",
        },
      },
      update: {
        name: `${row.countryCode} ${row.label}`,
        freqLabel: "年",
      },
    });

    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        sourceId: "worldbank",
        sourceSeriesKey: wbKey,
        fetchMethod: DataFetchMethod.API,
        granularity: "ANNUAL",
        releaseRule: rule,
        nextRunAt,
        enabled: true,
        priority: 3,
      },
      update: {
        sourceSeriesKey: wbKey,
        releaseRule: rule,
        enabled: true,
        ...(nextRunAt ? { nextRunAt } : {}),
      },
    });
    created++;
  }

  const total = await prisma.dataSubscription.count({
    where: { enabled: true, sourceId: "worldbank" },
  });
  console.log(
    `[seed-phase3-wb] 新增 ${created}，跳过已有 ${skipped}；worldbank 订阅合计 ${total}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
