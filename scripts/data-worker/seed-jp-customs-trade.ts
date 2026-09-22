import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  DataGranularity,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import {
  JP_CUSTOMS_TRADE_CSV,
  JP_CUSTOMS_TRADE_NEXT_RELEASE_AT,
  JP_CUSTOMS_TRADE_PAGE,
  JP_CUSTOMS_TRADE_PROVIDER,
  JP_CUSTOMS_TRADE_SCHEDULE,
  JP_CUSTOMS_TRADE_SERIES,
  JP_CUSTOMS_TRADE_SOURCE_ID,
  JP_CUSTOMS_TRADE_TERMS,
} from "../../src/lib/data/scheduler/jpCustomsTrade/catalog";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  await prisma.statisticalAgency.upsert({
    where: { id: "jp-customs" },
    create: {
      id: "jp-customs",
      countryCode: "JP",
      nameZh: "日本财务省关税局",
      nameEn: "Customs and Tariff Bureau, Ministry of Finance Japan",
      websiteUrl: "https://www.customs.go.jp/english/",
    },
    update: { nameZh: "日本财务省关税局", nameEn: "Customs and Tariff Bureau, Ministry of Finance Japan" },
  });
  const source = {
    agencyId: "jp-customs",
    name: "日本海关贸易统计世界月度时序",
    adapterKind: SourceAdapterKind.BULK_FILE,
    baseUrl: JP_CUSTOMS_TRADE_PAGE,
    termsUrl: JP_CUSTOMS_TRADE_TERMS,
    rateLimit: { requestsPerMinute: 20, minIntervalMs: 2_000 },
    metadata: {
      acquisition: "official_shift_jis_csv",
      fetchUrl: JP_CUSTOMS_TRADE_CSV,
      releaseSchedule: JP_CUSTOMS_TRADE_SCHEDULE,
      license: "Japan Customs website terms",
      attribution: "Source: Trade Statistics of Japan, Ministry of Finance.",
    },
  };
  await prisma.dataSource.upsert({
    where: { id: JP_CUSTOMS_TRADE_SOURCE_ID },
    create: { id: JP_CUSTOMS_TRADE_SOURCE_ID, ...source },
    update: source,
  });

  const probedAt = new Date().toISOString();
  for (const series of JP_CUSTOMS_TRADE_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: series.instrumentCode } });
    const previous = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? existing.metadata : {};
    // 旧版写过 derivation 字段（出口/进口为 null）——宏观库不允许派生标记，连同键一起去掉
    const { derivation: _legacyDerivation, ...previousClean } = previous as Record<string, unknown>;
    void _legacyDerivation;
    const metadata = {
      ...previousClean,
      sourceTag: "jp-customs-world-monthly-official-csv",
      countryCode: "JP",
      countryNameZh: "日本",
      catalogKey: `mds:${series.instrumentCode}`,
      catalogCategory: "对外与汇率",
      catalogSubcategory: "货物贸易",
      displayName: series.label,
      bootstrapOnly: false,
      source: "日本财务省关税局",
      officialUrl: JP_CUSTOMS_TRADE_PAGE,
      sourceUrl: JP_CUSTOMS_TRADE_CSV,
      releaseScheduleUrl: JP_CUSTOMS_TRADE_SCHEDULE,
      unit: "亿日元",
      sourceUnit: "thousand yen",
      scaleBy: 0.00001,
      freqLabel: "月",
      seasonalAdjustment: "NSA",
      stockFlow: "flow",
      referencePeriod: "month",
      geography: "日本全国（对世界）",
      sourceColumn: series.sourceColumn,
      historyStart: "1979-01-01",
      sourceUpdateNote:
        "海关世界月度CSV自1979年起，原值单位千日元；入库除以100,000转为亿日元。文件会预置未来月份为0，解析时丢弃。只存官方出口、进口两列，贸易差额在图表侧用指标运算；不接国别、地区、品目或行业。历年数会按速報、确报、确々报、确定依次修订，因此每次完整回读。",
      scrape: {
        provider: JP_CUSTOMS_TRADE_PROVIDER,
        url: JP_CUSTOMS_TRADE_CSV,
        sourceColumn: series.sourceColumn,
        script: "scripts/data-worker/sync-jp-customs-trade.ts",
      },
      fetchAcquisition: {
        status: "known",
        probedAt,
        method: "jp_customs_world_monthly_csv",
        methodLabel: "scripts/data-worker/sync-jp-customs-trade.ts",
        fetchUrl: JP_CUSTOMS_TRADE_CSV,
        officialUrl: JP_CUSTOMS_TRADE_PAGE,
        message: "日本海关公开Shift-JIS世界月度CSV；完整重读捕获各发布阶段修订。",
      },
      attribution: "Source: Trade Statistics of Japan, Ministry of Finance; Chinese labels translated by finance-site.",
    };
    const fields = {
      name: `日本：${series.label}`,
      nameEn: `Japan: ${series.nameEn}`,
      shortName: series.label,
      description: `日本海关贸易统计：${series.nameEn}`,
      freqLabel: "月",
      unit: "亿日元",
      metadata,
      externalRefs: {
        catalogKey: `mds:${series.instrumentCode}`,
        sourceId: JP_CUSTOMS_TRADE_SOURCE_ID,
        agencyId: "jp-customs",
        sourceColumn: series.sourceColumn,
      },
    };
    const instrument = await prisma.instrument.upsert({
      where: { code: series.instrumentCode },
      create: { code: series.instrumentCode, kind: InstrumentKind.MACRO_SERIES, ...fields },
      update: fields,
    });
    const subscription = {
      sourceId: JP_CUSTOMS_TRADE_SOURCE_ID,
      sourceSeriesKey: series.instrumentCode,
      fetchMethod: DataFetchMethod.BULK_DOWNLOAD,
      granularity: DataGranularity.MONTHLY,
      timezone: "Asia/Tokyo",
      releaseRule: { type: "probe_interval", intervalHours: 24 } as object,
      revisionLookback: 600,
      enabled: true,
      priority: 9,
    };
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: { instrumentId: instrument.id, ...subscription, nextRunAt: new Date(JP_CUSTOMS_TRADE_NEXT_RELEASE_AT) },
      update: subscription,
    });
    console.log(`seed ${series.instrumentCode}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Japan Customs trade seed failed");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
