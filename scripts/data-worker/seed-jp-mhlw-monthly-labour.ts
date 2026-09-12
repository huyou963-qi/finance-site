import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  DataGranularity,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import {
  JP_MHLW_MONTHLY_LABOUR_LIST_URL,
  JP_MHLW_MONTHLY_LABOUR_PROVIDER,
  JP_MHLW_MONTHLY_LABOUR_SERIES,
  JP_MHLW_MONTHLY_LABOUR_SOURCE_ID,
  jpMhlwMonthlyLabourDownloadUrl,
} from "../../src/lib/data/scheduler/jpMhlwMonthlyLabour/catalog";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  await prisma.statisticalAgency.upsert({
    where: { id: "jp-mhlw" },
    create: {
      id: "jp-mhlw",
      countryCode: "JP",
      nameZh: "日本厚生劳动省",
      nameEn: "Ministry of Health, Labour and Welfare",
      websiteUrl: "https://www.mhlw.go.jp/",
    },
    update: { nameZh: "日本厚生劳动省", nameEn: "Ministry of Health, Labour and Welfare" },
  });
  const source = {
    agencyId: "jp-mhlw",
    name: "日本每月勤劳统计（MHLW/e-Stat 官方长期时序 Excel）",
    adapterKind: SourceAdapterKind.REST_API,
    baseUrl: JP_MHLW_MONTHLY_LABOUR_LIST_URL,
    termsUrl: "https://www.e-stat.go.jp/terms-of-use",
    rateLimit: { minIntervalMs: 2_000, requestsPerMinute: 20 },
    metadata: {
      acquisition: "official_bulk_excel",
      governmentStatisticsCode: "00450071",
      publicAttribution: "Source: Ministry of Health, Labour and Welfare, Monthly Labour Survey, via e-Stat.",
    },
  };
  await prisma.dataSource.upsert({
    where: { id: JP_MHLW_MONTHLY_LABOUR_SOURCE_ID },
    create: { id: JP_MHLW_MONTHLY_LABOUR_SOURCE_ID, ...source },
    update: source,
  });

  for (const series of JP_MHLW_MONTHLY_LABOUR_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: series.instrumentCode } });
    const previous =
      existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? existing.metadata
        : {};
    const sourceUrl = jpMhlwMonthlyLabourDownloadUrl(series.statInfIdAtOnboarding);
    const metadata = {
      ...previous,
      sourceTag: "jp-mhlw-monthly-labour-official-excel",
      countryCode: "JP",
      countryNameZh: "日本",
      catalogKey: `mds:${series.instrumentCode}`,
      catalogCategory: "劳动力市场",
      displayName: series.label,
      bootstrapOnly: false,
      source: "日本厚生劳动省 / e-Stat",
      officialUrl: JP_MHLW_MONTHLY_LABOUR_LIST_URL,
      sourceUrl,
      unit: "指数（2020=100）",
      freqLabel: "月",
      baseYear: 2020,
      seasonalAdjustment: "NSA",
      establishmentSize: "常用劳动者5人以上",
      employmentType: "就业形态计",
      industry: "调查产业计",
      tableNo: series.tableNo,
      statInfIdAtOnboarding: series.statInfIdAtOnboarding,
      sourceUpdateNote:
        "月度长期时序表随确报整表重发；每次重读1990年以来完整指数历史，以统一writer记录实际抓取时点修订。旧e-Stat数据库表停更于2021年，不参与调度；不与最新月速報硬拼。",
      scrape: {
        provider: JP_MHLW_MONTHLY_LABOUR_PROVIDER,
        catalogueUrl: JP_MHLW_MONTHLY_LABOUR_LIST_URL,
        tableNo: series.tableNo,
        tableTitle: series.tableTitle,
        script: "scripts/data-worker/sync-jp-mhlw-monthly-labour.ts",
      },
      fetchAcquisition: {
        status: "known",
        probedAt: new Date().toISOString(),
        method: "jp_mhlw_monthly_labour_official_excel",
        methodLabel: "scripts/data-worker/sync-jp-mhlw-monthly-labour.ts",
        fetchUrl: JP_MHLW_MONTHLY_LABOUR_LIST_URL,
        officialUrl: JP_MHLW_MONTHLY_LABOUR_LIST_URL,
      },
      attribution:
        "Source: Ministry of Health, Labour and Welfare, Monthly Labour Survey, via e-Stat; Chinese labels translated by finance-site.",
    };
    const fields = {
      name: `日本：${series.label}`,
      freqLabel: "月",
      unit: "指数（2020=100）",
      metadata,
      externalRefs: {
        catalogKey: `mds:${series.instrumentCode}`,
        sourceId: JP_MHLW_MONTHLY_LABOUR_SOURCE_ID,
        agencyId: "jp-mhlw",
        estatStatInfId: series.statInfIdAtOnboarding,
        mhlwTableNo: series.tableNo,
      },
    };
    const instrument = await prisma.instrument.upsert({
      where: { code: series.instrumentCode },
      create: { code: series.instrumentCode, kind: InstrumentKind.MACRO_SERIES, ...fields },
      update: fields,
    });
    const subscription = {
      sourceId: JP_MHLW_MONTHLY_LABOUR_SOURCE_ID,
      sourceSeriesKey: series.instrumentCode,
      fetchMethod: DataFetchMethod.API,
      granularity: DataGranularity.MONTHLY,
      releaseRule: { type: "probe_interval", intervalHours: 24 } as object,
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
    console.error(error instanceof Error ? error.message : "MHLW monthly labour seed failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
