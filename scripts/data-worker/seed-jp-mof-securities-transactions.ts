import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  DataGranularity,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import {
  JP_MOF_SECURITIES_CSV,
  JP_MOF_SECURITIES_NEXT_RELEASE_AT,
  JP_MOF_SECURITIES_PAGE,
  JP_MOF_SECURITIES_PROVIDER,
  JP_MOF_SECURITIES_SCHEDULE,
  JP_MOF_SECURITIES_SERIES,
  JP_MOF_SECURITIES_SOURCE_ID,
  JP_MOF_SECURITIES_TERMS,
} from "../../src/lib/data/scheduler/jpMofSecuritiesTransactions/catalog";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  await prisma.statisticalAgency.upsert({
    where: { id: "jp-mof" },
    create: { id: "jp-mof", countryCode: "JP", nameZh: "日本财务省", nameEn: "Ministry of Finance Japan", websiteUrl: "https://www.mof.go.jp/" },
    update: { nameZh: "日本财务省", nameEn: "Ministry of Finance Japan" },
  });
  const source = {
    agencyId: "jp-mof",
    name: "日本财务省对外及对内证券投资月度",
    adapterKind: SourceAdapterKind.BULK_FILE,
    baseUrl: JP_MOF_SECURITIES_PAGE,
    termsUrl: JP_MOF_SECURITIES_TERMS,
    rateLimit: { requestsPerMinute: 20, minIntervalMs: 2_000 },
    metadata: {
      acquisition: "official_shift_jis_csv",
      fetchUrl: JP_MOF_SECURITIES_CSV,
      releaseSchedule: JP_MOF_SECURITIES_SCHEDULE,
      license: "Public Data License 1.0",
      attribution: "Source: Ministry of Finance Japan.",
    },
  };
  await prisma.dataSource.upsert({ where: { id: JP_MOF_SECURITIES_SOURCE_ID }, create: { id: JP_MOF_SECURITIES_SOURCE_ID, ...source }, update: source });

  const probedAt = new Date().toISOString();
  for (const series of JP_MOF_SECURITIES_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: series.instrumentCode } });
    const previous = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata) ? existing.metadata : {};
    const metadata = {
      ...previous,
      sourceTag: "jp-mof-international-securities-official-csv",
      countryCode: "JP",
      countryNameZh: "日本",
      catalogKey: `mds:${series.instrumentCode}`,
      catalogCategory: "对外与汇率",
      catalogSubcategory: "跨境证券投资",
      displayName: series.label,
      bootstrapOnly: false,
      source: "日本财务省",
      officialUrl: JP_MOF_SECURITIES_PAGE,
      sourceUrl: JP_MOF_SECURITIES_CSV,
      releaseScheduleUrl: JP_MOF_SECURITIES_SCHEDULE,
      unit: "亿日元",
      sourceUnit: "100 million Yen",
      freqLabel: "月",
      seasonalAdjustment: "NSA",
      stockFlow: "flow",
      referencePeriod: "month",
      geography: "日本全国/跨境",
      sourceColumns: series.columns,
      signConvention: "net_acquisition_positive",
      definitionBreaks: [
        { at: "2014-01-01", note: "股票项目自2014年起扩展为股票及投资基金份额；跨断点比较需谨慎。" },
      ],
      historyStart: "2005-01-01",
      sourceUpdateNote:
        "指定报告机构月报，覆盖主要金融机构而非完整BOP证券投资，较BOP早一个月。为消除2014年前发布版符号展示差异，统一从官方取得额减处置额计算：正值为净取得、负值为净处置；债券合计中长期债和短期债。2014年起股票口径加入投资基金份额，保留口径断点。",
      scrape: {
        provider: JP_MOF_SECURITIES_PROVIDER,
        url: JP_MOF_SECURITIES_CSV,
        sourceColumns: series.columns,
        script: "scripts/data-worker/sync-jp-mof-securities-transactions.ts",
      },
      fetchAcquisition: {
        status: "known",
        probedAt,
        method: "jp_mof_securities_monthly_csv",
        methodLabel: "scripts/data-worker/sync-jp-mof-securities-transactions.ts",
        fetchUrl: JP_MOF_SECURITIES_CSV,
        officialUrl: JP_MOF_SECURITIES_PAGE,
        message: "财务省公开Shift-JIS月度历史CSV；从取得与处置原项统一计算净取得并完整重读。",
      },
      attribution: "Source: Ministry of Finance Japan; Chinese labels translated by finance-site.",
    };
    const fields = {
      name: `日本：${series.label}`,
      nameEn: `Japan: ${series.nameEn}`,
      shortName: series.label,
      description: `日本财务省对外及对内证券投资：${series.nameEn}`,
      freqLabel: "月",
      unit: "亿日元",
      metadata,
      externalRefs: { catalogKey: `mds:${series.instrumentCode}`, sourceId: JP_MOF_SECURITIES_SOURCE_ID, agencyId: "jp-mof", sourceColumns: series.columns },
    };
    const instrument = await prisma.instrument.upsert({ where: { code: series.instrumentCode }, create: { code: series.instrumentCode, kind: InstrumentKind.MACRO_SERIES, ...fields }, update: fields });
    const subscription = {
      sourceId: JP_MOF_SECURITIES_SOURCE_ID,
      sourceSeriesKey: series.instrumentCode,
      fetchMethod: DataFetchMethod.BULK_DOWNLOAD,
      granularity: DataGranularity.MONTHLY,
      timezone: "Asia/Tokyo",
      releaseRule: { type: "probe_interval", intervalHours: 24 } as object,
      revisionLookback: 300,
      enabled: true,
      priority: 9,
    };
    await prisma.dataSubscription.upsert({ where: { instrumentId: instrument.id }, create: { instrumentId: instrument.id, ...subscription, nextRunAt: new Date(JP_MOF_SECURITIES_NEXT_RELEASE_AT) }, update: subscription });
    console.log(`seed ${series.instrumentCode}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "MOF securities seed failed");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
