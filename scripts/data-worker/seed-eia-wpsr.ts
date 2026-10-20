/**
 * EIA Weekly Petroleum Status Report official XLS seed.
 *
 * Integration command (after package.json registration): npm run data:seed-eia-wpsr
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import {
  DataFetchMethod,
  DataGranularity,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { computeNextRunAt, type ReleaseRule } from "../../src/lib/data/scheduler/releaseRule";
import {
  EIA_WPSR_PROVIDER,
  EIA_WPSR_SERIES,
  EIA_WPSR_SOURCE,
  EIA_WPSR_SYNC_SCRIPT,
  eiaWpsrPageUrl,
  eiaWpsrWorkbookUrl,
} from "../../src/lib/data/scheduler/eiaWpsr/catalog";

const prisma = new PrismaClient();
const RELEASE_RULE: ReleaseRule = { type: "probe_interval", intervalHours: 12 };

async function main() {
  await prisma.statisticalAgency.upsert({
    where: { id: EIA_WPSR_SOURCE.agencyId },
    create: {
      id: EIA_WPSR_SOURCE.agencyId,
      countryCode: "US",
      nameZh: EIA_WPSR_SOURCE.nameZh,
      nameEn: EIA_WPSR_SOURCE.nameEn,
      websiteUrl: EIA_WPSR_SOURCE.websiteUrl,
    },
    update: {
      nameZh: EIA_WPSR_SOURCE.nameZh,
      nameEn: EIA_WPSR_SOURCE.nameEn,
      websiteUrl: EIA_WPSR_SOURCE.websiteUrl,
    },
  });
  await prisma.dataSource.upsert({
    where: { id: EIA_WPSR_SOURCE.id },
    create: {
      id: EIA_WPSR_SOURCE.id,
      agencyId: EIA_WPSR_SOURCE.agencyId,
      name: EIA_WPSR_SOURCE.name,
      adapterKind: SourceAdapterKind.BULK_FILE,
      baseUrl: EIA_WPSR_SOURCE.baseUrl,
      termsUrl: EIA_WPSR_SOURCE.termsUrl,
      rateLimit: { requestsPerMinute: 10, minIntervalMs: 2_000 },
    },
    update: {
      agencyId: EIA_WPSR_SOURCE.agencyId,
      name: EIA_WPSR_SOURCE.name,
      adapterKind: SourceAdapterKind.BULK_FILE,
      baseUrl: EIA_WPSR_SOURCE.baseUrl,
      termsUrl: EIA_WPSR_SOURCE.termsUrl,
      rateLimit: { requestsPerMinute: 10, minIntervalMs: 2_000 },
    },
  });

  for (const row of EIA_WPSR_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: row.code } });
    const latestObs = existing
      ? await prisma.macroObservation.findFirst({
          where: { instrumentId: existing.id },
          orderBy: { obsDate: "desc" },
          select: { obsDate: true },
        })
      : null;
    const previous =
      existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {};
    const officialUrl = eiaWpsrPageUrl(row.sourceSeriesKey);
    const fetchUrl = eiaWpsrWorkbookUrl(row.sourceSeriesKey);
    const metadata = mergeFetchAcquisition(
      {
        ...previous,
        sourceTag: "eia-wpsr-official-xls",
        bootstrapOnly: false,
        source: "U.S. Energy Information Administration",
        providerNote: "EIA Weekly Petroleum Status Report",
        sourceUrl: officialUrl,
        officialUrl,
        countryCode: row.countryCode,
        countryNameZh: "美国",
        displayName: row.displayName,
        catalogKey: `mds:${row.code}`,
        catalogCategory: row.category,
        catalogSubcategory: row.subgroup,
        freqLabel: row.freqLabel,
        unit: row.unit,
        sourceUpdateNote: "EIA WPSR 周度官方完整历史 XLS；每周整表重读以捕捉修订",
        dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10),
        scrape: {
          provider: EIA_WPSR_PROVIDER,
          seriesId: row.sourceSeriesKey,
          url: fetchUrl,
          script: EIA_WPSR_SYNC_SCRIPT,
        },
      },
      {
        status: "known",
        probedAt: new Date().toISOString(),
        method: "eia_wpsr_official_xls",
        methodLabel: EIA_WPSR_SYNC_SCRIPT,
        fetchUrl,
        officialUrl,
        message: "EIA Petroleum Navigator 公开完整历史 XLS（公有领域；周度整表重读）",
      },
    );

    const instrument = await prisma.instrument.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        kind: InstrumentKind.MACRO_SERIES,
        name: row.name,
        freqLabel: row.freqLabel,
        unit: row.unit,
        metadata: metadata as object,
        externalRefs: {
          catalogKey: `mds:${row.code}`,
          agencyId: EIA_WPSR_SOURCE.agencyId,
          sourceId: EIA_WPSR_SOURCE.id,
          eiaSeriesId: row.sourceSeriesKey,
        },
      },
      update: {
        name: row.name,
        freqLabel: row.freqLabel,
        unit: row.unit,
        metadata: metadata as object,
        externalRefs: {
          catalogKey: `mds:${row.code}`,
          agencyId: EIA_WPSR_SOURCE.agencyId,
          sourceId: EIA_WPSR_SOURCE.id,
          eiaSeriesId: row.sourceSeriesKey,
        },
      },
    });

    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        sourceId: EIA_WPSR_SOURCE.id,
        sourceSeriesKey: row.sourceSeriesKey,
        fetchMethod: DataFetchMethod.BULK_DOWNLOAD,
        granularity: DataGranularity.WEEKLY,
        releaseRule: RELEASE_RULE,
        nextRunAt: computeNextRunAt(RELEASE_RULE, new Date()),
        enabled: true,
        priority: 9,
      },
      update: {
        sourceId: EIA_WPSR_SOURCE.id,
        sourceSeriesKey: row.sourceSeriesKey,
        fetchMethod: DataFetchMethod.BULK_DOWNLOAD,
        granularity: DataGranularity.WEEKLY,
        releaseRule: RELEASE_RULE,
        nextRunAt: computeNextRunAt(RELEASE_RULE, new Date()),
        enabled: true,
        priority: 9,
        retryCount: 0,
        lastError: null,
      },
    });
    console.log(`  ✓ ${row.code} ← ${row.sourceSeriesKey} (${existing ? "updated" : "created"})`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
