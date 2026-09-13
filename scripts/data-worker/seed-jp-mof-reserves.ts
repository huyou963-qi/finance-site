import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  DataGranularity,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import {
  JP_MOF_RESERVES_CSV,
  JP_MOF_RESERVES_PAGE,
  JP_MOF_RESERVES_PROVIDER,
  JP_MOF_RESERVES_SCHEDULE,
  JP_MOF_RESERVES_SERIES,
  JP_MOF_RESERVES_SOURCE_ID,
  JP_MOF_TERMS,
} from "../../src/lib/data/scheduler/jpMofReserves/catalog";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  await prisma.statisticalAgency.upsert({
    where: { id: "jp-mof" },
    create: {
      id: "jp-mof",
      countryCode: "JP",
      nameZh: "日本财务省",
      nameEn: "Ministry of Finance Japan",
      websiteUrl: "https://www.mof.go.jp/",
    },
    update: { nameZh: "日本财务省", nameEn: "Ministry of Finance Japan" },
  });
  const source = {
    agencyId: "jp-mof",
    name: "日本财务省国际储备历史数据",
    adapterKind: SourceAdapterKind.BULK_FILE,
    baseUrl: JP_MOF_RESERVES_PAGE,
    termsUrl: JP_MOF_TERMS,
    rateLimit: { requestsPerMinute: 20, minIntervalMs: 2_000 },
    metadata: {
      acquisition: "official_shift_jis_csv",
      fetchUrl: JP_MOF_RESERVES_CSV,
      releaseSchedule: JP_MOF_RESERVES_SCHEDULE,
      license: "Public Data License 1.0",
      attribution: "Source: Ministry of Finance Japan.",
    },
  };
  await prisma.dataSource.upsert({
    where: { id: JP_MOF_RESERVES_SOURCE_ID },
    create: { id: JP_MOF_RESERVES_SOURCE_ID, ...source },
    update: source,
  });

  const probedAt = new Date().toISOString();
  for (const series of JP_MOF_RESERVES_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: series.instrumentCode } });
    const previous =
      existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? existing.metadata
        : {};
    const metadata = {
      ...previous,
      sourceTag: "jp-mof-international-reserves-official-csv",
      countryCode: "JP",
      countryNameZh: "日本",
      catalogKey: `mds:${series.instrumentCode}`,
      catalogCategory: "对外与汇率",
      catalogSubcategory: "外汇储备",
      displayName: series.label,
      bootstrapOnly: false,
      source: "日本财务省",
      officialUrl: JP_MOF_RESERVES_PAGE,
      sourceUrl: JP_MOF_RESERVES_CSV,
      releaseScheduleUrl: JP_MOF_RESERVES_SCHEDULE,
      unit: series.unit,
      sourceUnit: series.unit === "百万美元" ? "US$ millions" : "million fine troy ounces",
      freqLabel: "月",
      seasonalAdjustment: "NSA",
      stockFlow: "stock",
      referencePeriod: "month_end",
      geography: "日本全国",
      sourceColumn: series.sourceName,
      historyStart: series.historyStart,
      sourceUpdateNote:
        "财务省按IMF国际储备模板公布月末美元计价存量，并在次月上旬发布。2000年4月起采用现行标准，与此前数据不连续，本接入不拼接旧口径。官方会事后订正历史月份，因此每次读取完整CSV并覆盖修订；版本账本只证明抓取时点可见值，不是历史首发PIT。",
      scrape: {
        provider: JP_MOF_RESERVES_PROVIDER,
        url: JP_MOF_RESERVES_CSV,
        sourceColumn: series.sourceName,
        script: "scripts/data-worker/sync-jp-mof-reserves.ts",
      },
      fetchAcquisition: {
        status: "known",
        probedAt,
        method: "jp_mof_official_reserves_csv",
        methodLabel: "scripts/data-worker/sync-jp-mof-reserves.ts",
        fetchUrl: JP_MOF_RESERVES_CSV,
        officialUrl: JP_MOF_RESERVES_PAGE,
        message: "财务省公开Shift-JIS历史CSV；单文件覆盖总额和主要构成，完整重读捕获修订。",
      },
      attribution: "Source: Ministry of Finance Japan; Chinese labels translated by finance-site.",
    };
    const fields = {
      name: `日本：${series.label}`,
      nameEn: `Japan: ${series.sourceName}`,
      shortName: series.label,
      description: `日本财务省国际储备：${series.sourceName}`,
      freqLabel: "月",
      unit: series.unit,
      metadata,
      externalRefs: {
        catalogKey: `mds:${series.instrumentCode}`,
        sourceId: JP_MOF_RESERVES_SOURCE_ID,
        agencyId: "jp-mof",
        sourceColumn: series.sourceName,
      },
    };
    const instrument = await prisma.instrument.upsert({
      where: { code: series.instrumentCode },
      create: { code: series.instrumentCode, kind: InstrumentKind.MACRO_SERIES, ...fields },
      update: fields,
    });
    const subscription = {
      sourceId: JP_MOF_RESERVES_SOURCE_ID,
      sourceSeriesKey: series.instrumentCode,
      fetchMethod: DataFetchMethod.BULK_DOWNLOAD,
      granularity: DataGranularity.MONTHLY,
      timezone: "Asia/Tokyo",
      releaseRule: { type: "probe_interval", intervalHours: 24 } as object,
      revisionLookback: 400,
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
    console.error(error instanceof Error ? error.message : "MOF reserves seed failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
