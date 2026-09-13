import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  DataGranularity,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import {
  JP_CABINET_OFFICE_TERMS_URL,
  JP_ESRI_MACHINERY_ORDERS_PAGE_URL,
  JP_ESRI_MACHINERY_ORDERS_PROVIDER,
  JP_ESRI_MACHINERY_ORDERS_SCHEDULE_URL,
  JP_ESRI_MACHINERY_ORDERS_SERIES,
  JP_ESRI_MACHINERY_ORDERS_SOURCE_ID,
} from "../../src/lib/data/scheduler/jpEsriMachineryOrders/catalog";

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
      websiteUrl: JP_ESRI_MACHINERY_ORDERS_PAGE_URL,
    },
    update: {},
  });
  const source = {
    agencyId: "jp-esri",
    name: "日本内阁府机械订单官方长期时序",
    adapterKind: SourceAdapterKind.REST_API,
    baseUrl: JP_ESRI_MACHINERY_ORDERS_PAGE_URL,
    termsUrl: JP_CABINET_OFFICE_TERMS_URL,
    rateLimit: { minIntervalMs: 2_000, requestsPerMinute: 20 },
    metadata: {
      acquisition: "official_index_discovered_bulk_excel",
      publicAttribution:
        "Source: Economic and Social Research Institute, Cabinet Office, Government of Japan.",
    },
  };
  await prisma.dataSource.upsert({
    where: { id: JP_ESRI_MACHINERY_ORDERS_SOURCE_ID },
    create: { id: JP_ESRI_MACHINERY_ORDERS_SOURCE_ID, ...source },
    update: source,
  });

  for (const series of JP_ESRI_MACHINERY_ORDERS_SERIES) {
    const existing = await prisma.instrument.findUnique({
      where: { code: series.instrumentCode },
    });
    const prior =
      existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? existing.metadata
        : {};
    const metadata = {
      ...prior,
      sourceTag: "jp-esri-machinery-orders-official-long-run-xlsx",
      countryCode: "JP",
      countryNameZh: "日本",
      catalogKey: `mds:${series.instrumentCode}`,
      catalogCategory: "国民经济",
      catalogSubgroup: "设备投资与机械订单",
      displayName: series.label,
      source: "日本内阁府 ESRI",
      sourceUrl: JP_ESRI_MACHINERY_ORDERS_PAGE_URL,
      officialUrl: JP_ESRI_MACHINERY_ORDERS_PAGE_URL,
      releaseScheduleUrl: JP_ESRI_MACHINERY_ORDERS_SCHEDULE_URL,
      unit: "百万日元",
      freqLabel: "月",
      seasonalAdjustment: "SA",
      priceBasis: "名义金额",
      bootstrapOnly: false,
      sourceUpdateNote:
        "发布页每月指向最新长期时序XLSX；每年1月调查时改订全部季调历史，其余月份用预测季节指数并保持既有历史不变。当前连续口径自2005-04开始。",
      scrape: {
        provider: JP_ESRI_MACHINERY_ORDERS_PROVIDER,
        url: JP_ESRI_MACHINERY_ORDERS_PAGE_URL,
        sheet: "季調・月次",
        column: series.column,
        script: "scripts/data-worker/sync-jp-esri-machinery-orders.ts",
      },
      fetchAcquisition: {
        status: "known",
        probedAt: new Date().toISOString(),
        method: "jp_esri_machinery_orders_official_excel",
        methodLabel: "scripts/data-worker/sync-jp-esri-machinery-orders.ts",
        fetchUrl: JP_ESRI_MACHINERY_ORDERS_PAGE_URL,
        officialUrl: JP_ESRI_MACHINERY_ORDERS_PAGE_URL,
      },
      provenance: {
        sourceType: "official_static_excel",
        historicalPit: false,
        revisionScope: "full_history_each_january",
        rawArchive: ".data/jp-esri-machinery-orders/snapshots",
      },
      attribution:
        "Source: Economic and Social Research Institute, Cabinet Office, Government of Japan; Chinese labels translated by finance-site.",
    };
    const fields = {
      name: `日本：${series.label}`,
      shortName: series.label,
      description: `内阁府机械受注统计调查：${series.label}`,
      freqLabel: "月",
      unit: "百万日元",
      metadata,
      externalRefs: {
        catalogKey: `mds:${series.instrumentCode}`,
        agencyId: "jp-esri",
        sourceId: JP_ESRI_MACHINERY_ORDERS_SOURCE_ID,
      },
    };
    const instrument = await prisma.instrument.upsert({
      where: { code: series.instrumentCode },
      create: { code: series.instrumentCode, kind: InstrumentKind.MACRO_SERIES, ...fields },
      update: fields,
    });
    const subscription = {
      sourceId: JP_ESRI_MACHINERY_ORDERS_SOURCE_ID,
      sourceSeriesKey: series.instrumentCode,
      fetchMethod: DataFetchMethod.API,
      granularity: DataGranularity.MONTHLY,
      releaseRule: { type: "probe_interval", intervalHours: 24 } as object,
      revisionLookback: 300,
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
    console.error(error instanceof Error ? error.message : "ESRI machinery orders seed failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
