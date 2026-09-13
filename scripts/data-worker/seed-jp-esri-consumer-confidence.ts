import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  DataGranularity,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import {
  JP_ESRI_CONSUMER_CONFIDENCE_FILE_URL,
  JP_ESRI_CONSUMER_CONFIDENCE_PAGE_URL,
  JP_ESRI_CONSUMER_CONFIDENCE_PROVIDER,
  JP_ESRI_CONSUMER_CONFIDENCE_SERIES,
  JP_ESRI_CONSUMER_CONFIDENCE_SOURCE_ID,
  JP_ESRI_RELEASE_SCHEDULE_URL,
} from "../../src/lib/data/scheduler/jpEsriConsumerConfidence/catalog";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  await prisma.statisticalAgency.upsert({
    where: { id: "jp-esri" },
    create: {
      id: "jp-esri",
      countryCode: "JP",
      nameZh: "日本内阁府经济社会综合研究所",
      nameEn: "Economic and Social Research Institute, Cabinet Office",
      websiteUrl: JP_ESRI_CONSUMER_CONFIDENCE_PAGE_URL,
    },
    update: {},
  });
  const source = {
    agencyId: "jp-esri",
    name: "日本内阁府消费者信心调查官方长期时序",
    adapterKind: SourceAdapterKind.REST_API,
    baseUrl: JP_ESRI_CONSUMER_CONFIDENCE_PAGE_URL,
    termsUrl: "https://www.cao.go.jp/notice/rule.html",
    rateLimit: { minIntervalMs: 2_000, requestsPerMinute: 20 },
    metadata: {
      acquisition: "official_bulk_excel",
      publicAttribution: "Source: Economic and Social Research Institute, Cabinet Office, Government of Japan.",
    },
  };
  await prisma.dataSource.upsert({
    where: { id: JP_ESRI_CONSUMER_CONFIDENCE_SOURCE_ID },
    create: { id: JP_ESRI_CONSUMER_CONFIDENCE_SOURCE_ID, ...source },
    update: source,
  });

  for (const series of JP_ESRI_CONSUMER_CONFIDENCE_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: series.instrumentCode } });
    const prior =
      existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? existing.metadata
        : {};
    const metadata = {
      ...prior,
      sourceTag: "jp-esri-consumer-confidence-official-excel",
      countryCode: "JP",
      countryNameZh: "日本",
      catalogKey: `mds:${series.instrumentCode}`,
      catalogCategory: "国民经济",
      catalogSubgroup: "消费者信心",
      displayName: series.label,
      source: "日本内阁府 ESRI",
      sourceUrl: JP_ESRI_CONSUMER_CONFIDENCE_FILE_URL,
      officialUrl: JP_ESRI_CONSUMER_CONFIDENCE_PAGE_URL,
      releaseScheduleUrl: JP_ESRI_RELEASE_SCHEDULE_URL,
      unit: "指数",
      freqLabel: "月",
      seasonalAdjustment: "SA",
      householdScope: "二人以上家庭",
      bootstrapOnly: false,
      sourceUpdateNote:
        "固定官方XLSX每月整表更新并回溯修订；1982-06起，2004-03前为季度调查；2013-04和2018-10调查方式改变，保留官方断点。",
      scrape: {
        provider: JP_ESRI_CONSUMER_CONFIDENCE_PROVIDER,
        url: JP_ESRI_CONSUMER_CONFIDENCE_FILE_URL,
        column: series.column,
        script: "scripts/data-worker/sync-jp-esri-consumer-confidence.ts",
      },
      fetchAcquisition: {
        status: "known",
        probedAt: new Date().toISOString(),
        method: "jp_esri_consumer_confidence_official_excel",
        methodLabel: "scripts/data-worker/sync-jp-esri-consumer-confidence.ts",
        fetchUrl: JP_ESRI_CONSUMER_CONFIDENCE_FILE_URL,
        officialUrl: JP_ESRI_CONSUMER_CONFIDENCE_PAGE_URL,
      },
      attribution:
        "Source: Economic and Social Research Institute, Cabinet Office, Government of Japan; Chinese labels translated by finance-site.",
    };
    const fields = {
      name: `日本：${series.label}`,
      shortName: series.label,
      description: `内阁府消费者动向调查：${series.label}`,
      freqLabel: "月",
      unit: "指数",
      metadata,
      externalRefs: {
        catalogKey: `mds:${series.instrumentCode}`,
        agencyId: "jp-esri",
        sourceId: JP_ESRI_CONSUMER_CONFIDENCE_SOURCE_ID,
      },
    };
    const instrument = await prisma.instrument.upsert({
      where: { code: series.instrumentCode },
      create: { code: series.instrumentCode, kind: InstrumentKind.MACRO_SERIES, ...fields },
      update: fields,
    });
    const subscription = {
      sourceId: JP_ESRI_CONSUMER_CONFIDENCE_SOURCE_ID,
      sourceSeriesKey: series.instrumentCode,
      fetchMethod: DataFetchMethod.API,
      granularity: DataGranularity.MONTHLY,
      releaseRule: { type: "probe_interval", intervalHours: 24 } as object,
      enabled: true,
      priority: 10,
    };
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: { instrumentId: instrument.id, ...subscription, nextRunAt: new Date() },
      update: subscription,
    });
    await prisma.dataSubscription.updateMany({
      where: { instrumentId: instrument.id, nextRunAt: null },
      data: { nextRunAt: new Date() },
    });
    console.log(`seed ${series.instrumentCode}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "ESRI consumer confidence seed failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
