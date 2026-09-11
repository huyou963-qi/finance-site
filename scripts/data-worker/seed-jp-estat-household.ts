import { loadEnvConfig } from "@next/env";
import { PrismaClient, InstrumentKind, DataFetchMethod, DataGranularity } from "@prisma/client";
import { PHASE5_DATA_SOURCES } from "../../src/lib/data/scheduler/phase5SeedCatalog";
import {
  JP_ESTAT_HOUSEHOLD_SERIES,
  JP_ESTAT_HOUSEHOLD_SOURCE_ID,
  buildJpEStatHouseholdMetadata,
} from "../../src/lib/data/scheduler/eStat/householdCatalog";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const source = PHASE5_DATA_SOURCES[JP_ESTAT_HOUSEHOLD_SOURCE_ID];
  await prisma.dataSource.upsert({
    where: { id: source.id },
    create: source,
    update: {
      name: source.name,
      adapterKind: source.adapterKind,
      baseUrl: source.baseUrl,
      termsUrl: source.termsUrl,
      rateLimit: source.rateLimit,
      metadata: source.metadata,
    },
  });

  for (const series of JP_ESTAT_HOUSEHOLD_SERIES) {
    const old = await prisma.instrument.findUnique({ where: { code: series.instrumentCode } });
    const previous = old?.metadata && typeof old.metadata === "object" && !Array.isArray(old.metadata) ? old.metadata : {};
    const fields = {
      name: `日本：${series.label}`,
      unit: series.unit,
      freqLabel: "月",
      metadata: { ...previous, ...buildJpEStatHouseholdMetadata(series) },
      externalRefs: {
        sourceId: source.id,
        statsDataId: series.eStat.statsDataId,
        catalogKey: `mds:${series.instrumentCode}`,
      },
    };
    const instrument = await prisma.instrument.upsert({
      where: { code: series.instrumentCode },
      create: { code: series.instrumentCode, kind: InstrumentKind.MACRO_SERIES, ...fields },
      update: fields,
    });
    const subscription = {
      sourceId: source.id,
      sourceSeriesKey: series.eStat.statsDataId,
      fetchMethod: DataFetchMethod.API,
      granularity: DataGranularity.MONTHLY,
      releaseRule: { type: "probe_interval", intervalHours: 24 },
      enabled: true,
      priority: 8,
    };
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: { instrumentId: instrument.id, ...subscription, nextRunAt: new Date() },
      update: subscription,
    });
    console.log(`seed ${series.instrumentCode}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Household Survey seed failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
