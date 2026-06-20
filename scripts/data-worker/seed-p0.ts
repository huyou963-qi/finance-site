/**
 * P0 种子：统计机构、FRED 数据源、10 条试点 Instrument + DataSubscription
 *
 * npm run data:seed-p0
 */
import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import {
  P0_DATA_SOURCE_FRED,
  P0_FRED_PILOT_SERIES,
  P0_STATISTICAL_AGENCIES,
  releaseRuleForPilot,
} from "../../src/lib/data/scheduler/p0SeedCatalog";
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

async function main() {
  console.log("[data:seed-p0] 写入统计机构…");
  for (const a of P0_STATISTICAL_AGENCIES) {
    await prisma.statisticalAgency.upsert({
      where: { id: a.id },
      create: {
        id: a.id,
        countryCode: a.countryCode,
        nameZh: a.nameZh,
        nameEn: a.nameEn ?? null,
        websiteUrl: a.websiteUrl ?? null,
        metadata: "metadata" in a ? (a.metadata as object) : undefined,
      },
      update: {
        countryCode: a.countryCode,
        nameZh: a.nameZh,
        nameEn: a.nameEn ?? null,
        websiteUrl: a.websiteUrl ?? null,
        metadata: "metadata" in a ? (a.metadata as object) : undefined,
      },
    });
  }

  console.log("[data:seed-p0] 写入数据源 fred…");
  await prisma.dataSource.upsert({
    where: { id: P0_DATA_SOURCE_FRED.id },
    create: {
      id: P0_DATA_SOURCE_FRED.id,
      agencyId: P0_DATA_SOURCE_FRED.agencyId,
      name: P0_DATA_SOURCE_FRED.name,
      adapterKind: SourceAdapterKind.FRED_API,
      baseUrl: P0_DATA_SOURCE_FRED.baseUrl,
      termsUrl: P0_DATA_SOURCE_FRED.termsUrl,
      rateLimit: P0_DATA_SOURCE_FRED.rateLimit,
    },
    update: {
      agencyId: P0_DATA_SOURCE_FRED.agencyId,
      name: P0_DATA_SOURCE_FRED.name,
      adapterKind: SourceAdapterKind.FRED_API,
      baseUrl: P0_DATA_SOURCE_FRED.baseUrl,
      termsUrl: P0_DATA_SOURCE_FRED.termsUrl,
      rateLimit: P0_DATA_SOURCE_FRED.rateLimit,
    },
  });

  console.log("[data:seed-p0] 写入 10 条试点序列与订阅…");
  for (const row of P0_FRED_PILOT_SERIES) {
    const rule = releaseRuleForPilot(row.fredId, row.granularity);
    const nextRunAt = computeNextRunAt(rule, new Date());

    const instrument = await prisma.instrument.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        kind: InstrumentKind.MACRO_SERIES,
        name: row.name,
        freqLabel: row.freqLabel,
        unit: row.unit,
        fredSeriesId: row.fredId,
        externalRefs: {
          catalogKey: `fred:${row.fredId}`,
          agencyId: "us-fred",
          sourceId: "fred",
        },
      },
      update: {
        name: row.name,
        freqLabel: row.freqLabel,
        unit: row.unit,
        fredSeriesId: row.fredId,
        externalRefs: {
          catalogKey: `fred:${row.fredId}`,
          agencyId: "us-fred",
          sourceId: "fred",
        },
      },
    });

    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        sourceId: "fred",
        sourceSeriesKey: row.fredId,
        fetchMethod: DataFetchMethod.API,
        granularity: row.granularity,
        releaseRule: rule,
        nextRunAt,
        enabled: true,
        priority: 10,
      },
      update: {
        sourceSeriesKey: row.fredId,
        granularity: row.granularity,
        releaseRule: rule,
        enabled: true,
        ...(nextRunAt ? { nextRunAt } : {}),
      },
    });

    console.log(`  ✓ ${row.code} (${row.fredId})`);
  }

  console.log(
    "[data:seed-p0] 完成。先运行 npm run data:sync-calendar 对齐发布时间，再 npm run data:worker 拉取。",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
