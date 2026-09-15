import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  DataGranularity,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import {
  JP_MOF_EXTERNAL_DEBT_XLS,
  JP_MOF_EXTERNAL_POSITION_NEXT_RELEASE_AT,
  JP_MOF_EXTERNAL_POSITION_PAGE,
  JP_MOF_EXTERNAL_POSITION_PROVIDER,
  JP_MOF_EXTERNAL_POSITION_SCHEDULE,
  JP_MOF_EXTERNAL_POSITION_SERIES,
  JP_MOF_EXTERNAL_POSITION_SOURCE_ID,
  JP_MOF_EXTERNAL_POSITION_TERMS,
  JP_MOF_IIP_XLS,
} from "../../src/lib/data/scheduler/jpMofExternalPosition/catalog";

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
    name: "日本财务省国际投资头寸及对外债务季度估计",
    adapterKind: SourceAdapterKind.BULK_FILE,
    baseUrl: JP_MOF_EXTERNAL_POSITION_PAGE,
    termsUrl: JP_MOF_EXTERNAL_POSITION_TERMS,
    rateLimit: { requestsPerMinute: 20, minIntervalMs: 2_000 },
    metadata: {
      acquisition: "official_xls",
      fetchUrls: [JP_MOF_IIP_XLS, JP_MOF_EXTERNAL_DEBT_XLS],
      releaseSchedule: JP_MOF_EXTERNAL_POSITION_SCHEDULE,
      license: "Public Data License 1.0",
      attribution: "Source: Ministry of Finance Japan.",
    },
  };
  await prisma.dataSource.upsert({ where: { id: JP_MOF_EXTERNAL_POSITION_SOURCE_ID }, create: { id: JP_MOF_EXTERNAL_POSITION_SOURCE_ID, ...source }, update: source });

  const probedAt = new Date().toISOString();
  for (const series of JP_MOF_EXTERNAL_POSITION_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: series.instrumentCode } });
    const previous = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata) ? existing.metadata : {};
    const sourceUrl = series.workbook === "iip" ? JP_MOF_IIP_XLS : JP_MOF_EXTERNAL_DEBT_XLS;
    const metadata = {
      ...previous,
      sourceTag: "jp-mof-iip-external-debt-official-xls",
      countryCode: "JP",
      countryNameZh: "日本",
      catalogKey: `mds:${series.instrumentCode}`,
      catalogCategory: "对外与汇率",
      catalogSubcategory: "国际投资头寸",
      displayName: series.label,
      bootstrapOnly: false,
      source: "日本财务省",
      officialUrl: JP_MOF_EXTERNAL_POSITION_PAGE,
      sourceUrl,
      releaseScheduleUrl: JP_MOF_EXTERNAL_POSITION_SCHEDULE,
      unit: "十亿日元",
      sourceUnit: "Billion Yen",
      freqLabel: "季",
      seasonalAdjustment: "NSA",
      stockFlow: "stock",
      referencePeriod: "quarter_end",
      geography: "日本全国",
      sourceSheet: series.sheet,
      sourceColumn: series.headerAnchor,
      historyStart: "2015-03-01",
      sourceUpdateNote:
        "采用财务省BPM6季度估计滚动XLS，四项保持同频同口径。当前官方滚动文件自2015Q1起；不与2013年末以前BPM5或更早年度表拼接。最新季度为一次估计，随后季度会修订，年末季度最终与年度IIP衔接，因此每次完整回读并保留版本。",
      scrape: {
        provider: JP_MOF_EXTERNAL_POSITION_PROVIDER,
        url: sourceUrl,
        sourceSheet: series.sheet,
        sourceColumn: series.headerAnchor,
        script: "scripts/data-worker/sync-jp-mof-external-position.ts",
      },
      fetchAcquisition: {
        status: "known",
        probedAt,
        method: "jp_mof_iip_external_debt_xls",
        methodLabel: "scripts/data-worker/sync-jp-mof-external-position.ts",
        fetchUrl: sourceUrl,
        officialUrl: JP_MOF_EXTERNAL_POSITION_PAGE,
        message: "财务省公开BPM6季度IIP和对外债务XLS；完整重读捕获估计值修订。",
      },
      attribution: "Source: Ministry of Finance Japan; Chinese labels translated by finance-site.",
    };
    const fields = {
      name: `日本：${series.label}`,
      nameEn: `Japan: ${series.nameEn}`,
      shortName: series.label,
      description: `日本财务省：${series.nameEn}`,
      freqLabel: "季",
      unit: "十亿日元",
      metadata,
      externalRefs: { catalogKey: `mds:${series.instrumentCode}`, sourceId: JP_MOF_EXTERNAL_POSITION_SOURCE_ID, agencyId: "jp-mof", sourceSheet: series.sheet, sourceColumn: series.headerAnchor },
    };
    const instrument = await prisma.instrument.upsert({ where: { code: series.instrumentCode }, create: { code: series.instrumentCode, kind: InstrumentKind.MACRO_SERIES, ...fields }, update: fields });
    const subscription = {
      sourceId: JP_MOF_EXTERNAL_POSITION_SOURCE_ID,
      sourceSeriesKey: series.instrumentCode,
      fetchMethod: DataFetchMethod.BULK_DOWNLOAD,
      granularity: DataGranularity.QUARTERLY,
      timezone: "Asia/Tokyo",
      releaseRule: { type: "probe_interval", intervalHours: 72 } as object,
      revisionLookback: 48,
      enabled: true,
      priority: 8,
    };
    await prisma.dataSubscription.upsert({ where: { instrumentId: instrument.id }, create: { instrumentId: instrument.id, ...subscription, nextRunAt: new Date(JP_MOF_EXTERNAL_POSITION_NEXT_RELEASE_AT) }, update: subscription });
    console.log(`seed ${series.instrumentCode}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "MOF external position seed failed");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
