import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  DataGranularity,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import {
  JP_METI_RETAIL_PAGE,
  JP_METI_RETAIL_ESTAT_LIST,
  JP_METI_RETAIL_PROVIDER,
  JP_METI_RETAIL_SERIES,
  JP_METI_RETAIL_SOURCE_ID,
  JP_METI_RETAIL_URL,
} from "../../src/lib/data/scheduler/jpMetiRetail/catalog";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  await prisma.statisticalAgency.upsert({
    where: { id: "jp-meti" },
    create: {
      id: "jp-meti",
      countryCode: "JP",
      nameZh: "日本经济产业省",
      nameEn: "Ministry of Economy, Trade and Industry",
      websiteUrl: "https://www.meti.go.jp/",
    },
    update: { nameZh: "日本经济产业省", nameEn: "Ministry of Economy, Trade and Industry" },
  });
  const source = {
    agencyId: "jp-meti",
    name: "日本 METI 商业动态统计长期时序",
    adapterKind: SourceAdapterKind.BULK_FILE,
    baseUrl: JP_METI_RETAIL_PAGE,
    termsUrl: "https://www.e-stat.go.jp/terms-of-use",
    rateLimit: { minIntervalMs: 2_000, requestsPerMinute: 20 },
    metadata: {
      acquisition: "official_bulk_excel",
      catalogueUrl: JP_METI_RETAIL_ESTAT_LIST,
      metiOfficialWorkbook: JP_METI_RETAIL_URL,
      publicAttribution: "Source: Ministry of Economy, Trade and Industry, Current Survey of Commerce.",
    },
  };
  await prisma.dataSource.upsert({
    where: { id: JP_METI_RETAIL_SOURCE_ID },
    create: { id: JP_METI_RETAIL_SOURCE_ID, ...source },
    update: source,
  });

  for (const series of JP_METI_RETAIL_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: series.instrumentCode } });
    const previous = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? existing.metadata
      : {};
    const metadata = {
      ...previous,
      sourceTag: "jp-meti-current-survey-commerce-official-excel",
      countryCode: "JP",
      countryNameZh: "日本",
      catalogKey: `mds:${series.instrumentCode}`,
      catalogCategory: "国民经济",
      catalogSubcategory: "零售销售",
      displayName: series.label,
      bootstrapOnly: false,
      source: "日本经济产业省 / e-Stat",
      officialUrl: JP_METI_RETAIL_PAGE,
      sourceUrl: JP_METI_RETAIL_ESTAT_LIST,
      unit: "十亿日元",
      sourceUnit: "10億円",
      freqLabel: "月",
      seasonalAdjustment: "NSA",
      priceBasis: "nominal",
      geography: "日本全国",
      sourceIndustryName: series.sourceName,
      historyStart: series.historyStart,
      sourceUpdateNote:
        "METI商业动态统计长期时序表的官方月度名义销售额。每次重读完整历史以捕获年度补正和水准调整；不由本站推算同比或环比。无店铺等后增分类仅从官方开始表章月份保存。2020年3月和2025年1月存在官方标注的水准断点。版本账本记录抓取时点可见值，不代表历史首发PIT。",
      scrape: {
        provider: JP_METI_RETAIL_PROVIDER,
        catalogueUrl: JP_METI_RETAIL_ESTAT_LIST,
        sourceColumn: series.sourceName,
        script: "scripts/data-worker/sync-jp-meti-retail.ts",
      },
      fetchAcquisition: {
        status: "known",
        probedAt: new Date().toISOString(),
        method: "jp_meti_current_survey_commerce_official_excel",
        methodLabel: "scripts/data-worker/sync-jp-meti-retail.ts",
        fetchUrl: JP_METI_RETAIL_ESTAT_LIST,
        officialUrl: JP_METI_RETAIL_PAGE,
      },
      attribution:
        "Source: Ministry of Economy, Trade and Industry, Current Survey of Commerce; Chinese labels translated by finance-site.",
    };
    const fields = {
      name: `日本：${series.label}`,
      shortName: series.label,
      freqLabel: "月",
      unit: "十亿日元",
      metadata,
      externalRefs: {
        catalogKey: `mds:${series.instrumentCode}`,
        sourceId: JP_METI_RETAIL_SOURCE_ID,
        agencyId: "jp-meti",
        sourceColumn: series.sourceName,
      },
    };
    const instrument = await prisma.instrument.upsert({
      where: { code: series.instrumentCode },
      create: { code: series.instrumentCode, kind: InstrumentKind.MACRO_SERIES, ...fields },
      update: fields,
    });
    const subscription = {
      sourceId: JP_METI_RETAIL_SOURCE_ID,
      sourceSeriesKey: series.instrumentCode,
      fetchMethod: DataFetchMethod.BULK_DOWNLOAD,
      granularity: DataGranularity.MONTHLY,
      releaseRule: { type: "probe_interval", intervalHours: 72 } as object,
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
    console.error(error instanceof Error ? error.message : "METI commerce seed failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
