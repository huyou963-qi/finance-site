import { loadEnvConfig } from "@next/env";
import { DataFetchMethod, DataGranularity, InstrumentKind, PrismaClient, SourceAdapterKind } from "@prisma/client";
import {
  JP_CAO_WATCHERS_AGENCY_ID,
  JP_CAO_WATCHERS_PAGE_URL,
  JP_CAO_WATCHERS_PROVIDER,
  JP_CAO_WATCHERS_SCHEDULE_URL,
  JP_CAO_WATCHERS_SERIES,
  JP_CAO_WATCHERS_SOURCE_ID,
  JP_CAO_WATCHERS_TERMS_URL,
  JP_CAO_WATCHERS_WORKBOOK_URL,
} from "../../src/lib/data/scheduler/jpCabinetEconomyWatchers/catalog";
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
const rule = { type: "probe_interval" as const, intervalHours: 24 };

async function main() {
  await prisma.statisticalAgency.upsert({
    where: { id: JP_CAO_WATCHERS_AGENCY_ID },
    create: {
      id: JP_CAO_WATCHERS_AGENCY_ID,
      countryCode: "JP",
      nameZh: "日本内阁府（经济财政分析）",
      nameEn: "Cabinet Office, Government of Japan",
      websiteUrl: JP_CAO_WATCHERS_PAGE_URL,
    },
    update: { websiteUrl: JP_CAO_WATCHERS_PAGE_URL },
  });
  const source = {
    agencyId: JP_CAO_WATCHERS_AGENCY_ID,
    name: "日本内阁府景气观察者调查官方Excel",
    adapterKind: SourceAdapterKind.REST_API,
    baseUrl: JP_CAO_WATCHERS_PAGE_URL,
    termsUrl: JP_CAO_WATCHERS_TERMS_URL,
    rateLimit: { minIntervalMs: 5000, requestsPerMinute: 6 },
  };
  await prisma.dataSource.upsert({
    where: { id: JP_CAO_WATCHERS_SOURCE_ID },
    create: { id: JP_CAO_WATCHERS_SOURCE_ID, ...source },
    update: source,
  });

  for (const row of JP_CAO_WATCHERS_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: row.instrumentCode } });
    const previous = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? existing.metadata : {};
    const metadata = {
      ...previous,
      countryCode: "JP",
      countryNameZh: "日本",
      source: "日本内阁府 景气观察者调查",
      officialUrl: JP_CAO_WATCHERS_PAGE_URL,
      sourceUrl: JP_CAO_WATCHERS_PAGE_URL,
      catalogKey: `mds:${row.instrumentCode}`,
      catalogCategory: "国民经济",
      catalogSubgroup: "景气调查",
      displayName: row.label,
      freqLabel: "月",
      unit: "DI",
      bootstrapOnly: false,
      seasonalAdjustment: "SA",
      benchmark: 50,
      perspective: row.perspective,
      sourceComponent: row.componentJa,
      periodConvention: "survey_month_start",
      sourceUpdateNote: "月度发布；内阁府每年重算季节因子并追溯修订既往季调值，因此每次完整回读2002年以来官方时序。版本账本只证明实际抓取时点可见值，并非历史首发PIT。",
      fetchAcquisition: {
        status: "known",
        method: "jp_cao_economy_watchers_official_excel",
        methodLabel: "scripts/data-worker/sync-jp-cao-economy-watchers.ts",
        fetchUrl: JP_CAO_WATCHERS_WORKBOOK_URL,
        officialUrl: JP_CAO_WATCHERS_PAGE_URL,
      },
      scrape: {
        provider: JP_CAO_WATCHERS_PROVIDER,
        url: JP_CAO_WATCHERS_WORKBOOK_URL,
        pageUrl: JP_CAO_WATCHERS_PAGE_URL,
        scheduleUrl: JP_CAO_WATCHERS_SCHEDULE_URL,
        sheet: row.sheet,
        component: row.component,
        script: "scripts/data-worker/sync-jp-cao-economy-watchers.ts",
      },
      provenance: {
        sourceType: "official_static_excel",
        attribution: "Source: Economy Watchers Survey, Cabinet Office, Government of Japan",
        licenseUrl: JP_CAO_WATCHERS_TERMS_URL,
        revisionScope: "full_history_annual_seasonal_recalculation",
        rawArchive: ".data/jp-cao-economy-watchers/snapshots",
      },
    };
    const instrumentFields = {
      name: row.label,
      unit: "DI",
      freqLabel: "月",
      metadata,
      externalRefs: {
        catalogKey: `mds:${row.instrumentCode}`,
        sourceId: JP_CAO_WATCHERS_SOURCE_ID,
        agencyId: JP_CAO_WATCHERS_AGENCY_ID,
      },
    };
    const instrument = await prisma.instrument.upsert({
      where: { code: row.instrumentCode },
      create: { code: row.instrumentCode, kind: InstrumentKind.MACRO_SERIES, ...instrumentFields },
      update: instrumentFields,
    });
    const subscriptionFields = {
      sourceId: JP_CAO_WATCHERS_SOURCE_ID,
      sourceSeriesKey: row.instrumentCode,
      fetchMethod: DataFetchMethod.API,
      granularity: DataGranularity.MONTHLY,
      enabled: true,
      revisionLookback: 1200,
    };
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        ...subscriptionFields,
        releaseRule: rule,
        nextRunAt: computeNextRunAt(rule, new Date()),
        priority: 8,
      },
      update: subscriptionFields,
    });
  }
  console.log(`[seed-jp-cao-economy-watchers] ${JP_CAO_WATCHERS_SERIES.length} instruments/subscriptions seeded`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
