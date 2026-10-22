/**
 * Cass 货运指数（Shipments / Expenditures）FRED 种子。
 *
 * npm run data:seed-cass-freight-index
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
import { BTS_TRANSPORT_FIELDS, BTS_TRANSPORT_URL } from "../../src/lib/data/scheduler/adapters/btsTransportAdapter";
import {
  CASS_FREIGHT_INDEX_FRED_SERIES,
  buildCassFreightIndexInstrumentMetadata,
  releaseRuleForCassFreightIndex,
} from "../../src/lib/data/scheduler/cassFreightIndexFredSeedCatalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

async function main() {
  await prisma.statisticalAgency.upsert({ where: { id: "us-bts" },
    create: { id: "us-bts", countryCode: "US", nameZh: "美国运输统计局", nameEn: "Bureau of Transportation Statistics", websiteUrl: "https://www.bts.gov/" }, update: {} });
  await prisma.dataSource.upsert({ where: { id: "us-bts-transport" },
    create: { id: "us-bts-transport", agencyId: "us-bts", name: "BTS 官方季调运输数据", adapterKind: SourceAdapterKind.BULK_FILE, baseUrl: BTS_TRANSPORT_URL },
    update: { adapterKind: SourceAdapterKind.BULK_FILE, baseUrl: BTS_TRANSPORT_URL } });
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

  for (const item of CASS_FREIGHT_INDEX_FRED_SERIES) {
    const sourceId = BTS_TRANSPORT_FIELDS[item.fredId] ? "us-bts-transport" : "fred";
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
    const metadata = buildCassFreightIndexInstrumentMetadata(item, {
      existing: existingMetadata,
      dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10) ?? null,
    });
    const externalRefs = {
      ...(existing?.externalRefs && typeof existing.externalRefs === "object" && !Array.isArray(existing.externalRefs) ? existing.externalRefs : {}),
      catalogKey: `fred:${item.fredId}`, agencyId: sourceId === "fred" ? "us-fred" : "us-bts",
      sourceId, cassFreightIndexCategory: item.category,
    };

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
        externalRefs,
      },
      update: {
        name: item.name,
        freqLabel: item.freqLabel,
        unit: item.unit,
        fredSeriesId: item.fredId,
        metadata,
        externalRefs,
      },
    });

    const releaseRule = releaseRuleForCassFreightIndex();
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        sourceId,
        sourceSeriesKey: item.fredId,
        fetchMethod: DataFetchMethod.API,
        granularity: item.granularity,
        releaseRule,
        nextRunAt: computeNextRunAt(releaseRule, new Date()),
        ...(BTS_TRANSPORT_FIELDS[item.fredId] ? { revisionLookback: 600 } : {}),
        enabled: true,
        priority: 10,
      },
      update: {
        sourceId,
        sourceSeriesKey: item.fredId,
        fetchMethod: DataFetchMethod.API,
        granularity: item.granularity,
        releaseRule,
        // Existing release-package clock and explicit admin disable survive seed.
        ...(BTS_TRANSPORT_FIELDS[item.fredId] ? { revisionLookback: 600 } : {}),
        priority: 10,
        // Only a real worker fetch may clear the previous failure state.
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
