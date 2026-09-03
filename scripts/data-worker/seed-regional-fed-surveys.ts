/**
 * 地区联储制造业景气调查（Empire State / Philadelphia Fed / Dallas Fed）FRED 种子。
 *
 * npm run data:seed-regional-fed-surveys
 */
import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import { P0_DATA_SOURCE_FRED } from "../../src/lib/data/scheduler/p0SeedCatalog";
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";
import {
  REGIONAL_FED_SURVEY_FRED_SERIES,
  buildRegionalFedSurveyInstrumentMetadata,
  releaseRuleForRegionalFedSurvey,
} from "../../src/lib/data/scheduler/regionalFedSurveysFredSeedCatalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

async function main() {
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
    update: {},
  });

  for (const item of REGIONAL_FED_SURVEY_FRED_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: item.code } });
    const latestObs = existing
      ? await prisma.macroObservation.findFirst({
          where: { instrumentId: existing.id },
          orderBy: { obsDate: "desc" },
          select: { obsDate: true },
        })
      : null;
    const existingMetadata =
      existing?.metadata &&
      typeof existing.metadata === "object" &&
      !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : null;
    const metadata = buildRegionalFedSurveyInstrumentMetadata(item, {
      existing: existingMetadata,
      dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10) ?? null,
    });

    const instrument = await prisma.instrument.upsert({
      where: { code: item.code },
      create: {
        code: item.code,
        kind: InstrumentKind.MACRO_SERIES,
        name: item.name,
        freqLabel: item.freqLabel,
        unit: item.unit,
        fredSeriesId: item.fredId,
        metadata,
        externalRefs: {
          catalogKey: `fred:${item.fredId}`,
          agencyId: "us-fred",
          sourceId: "fred",
          regionalFedSurveyCategory: item.category,
        },
      },
      update: {
        name: item.name,
        freqLabel: item.freqLabel,
        unit: item.unit,
        fredSeriesId: item.fredId,
        metadata,
      },
    });

    const releaseRule = releaseRuleForRegionalFedSurvey();
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        sourceId: "fred",
        sourceSeriesKey: item.fredId,
        fetchMethod: DataFetchMethod.API,
        granularity: item.granularity,
        releaseRule,
        nextRunAt: computeNextRunAt(releaseRule, new Date()),
        enabled: true,
        priority: 10,
      },
      update: {
        sourceId: "fred",
        sourceSeriesKey: item.fredId,
        fetchMethod: DataFetchMethod.API,
        granularity: item.granularity,
        releaseRule,
        nextRunAt: computeNextRunAt(releaseRule, new Date()),
        enabled: true,
        priority: 10,
        retryCount: 0,
        lastError: null,
      },
    });
    console.log(`  ✓ ${item.code} (${item.fredId}) ${existing ? "updated" : "created"}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
