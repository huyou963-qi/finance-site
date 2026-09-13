import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  DataGranularity,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";
import {
  JP_JNTO_NEXT_PUBLISHED_RELEASE_AT,
  JP_JNTO_VISITOR_ARRIVALS_HISTORY_START,
  JP_JNTO_VISITOR_ARRIVALS_PAGE_URL,
  JP_JNTO_VISITOR_ARRIVALS_PROVIDER,
  JP_JNTO_VISITOR_ARRIVALS_SCHEDULE_URL,
  JP_JNTO_VISITOR_ARRIVALS_SERIES,
  JP_JNTO_VISITOR_ARRIVALS_SOURCE_ID,
  JP_JNTO_VISITOR_ARRIVALS_SYNC_SCRIPT,
} from "../../src/lib/data/scheduler/jpJntoVisitorArrivals/catalog";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

const releaseRule = { type: "probe_interval" as const, intervalHours: 24 };

function initialNextRunAt(now: Date): Date {
  const published = new Date(JP_JNTO_NEXT_PUBLISHED_RELEASE_AT);
  return published > now ? published : computeNextRunAt(releaseRule, now)!;
}

async function main() {
  await prisma.statisticalAgency.upsert({
    where: { id: "jp-jnto" },
    create: {
      id: "jp-jnto",
      countryCode: "JP",
      nameZh: "日本政府观光局",
      nameEn: "Japan National Tourism Organization",
      websiteUrl: "https://www.jnto.go.jp/",
    },
    update: {
      nameZh: "日本政府观光局",
      nameEn: "Japan National Tourism Organization",
      websiteUrl: "https://www.jnto.go.jp/",
    },
  });
  const source = {
    agencyId: "jp-jnto",
    name: "JNTO 访日外客统计时序表",
    adapterKind: SourceAdapterKind.BULK_FILE,
    baseUrl: JP_JNTO_VISITOR_ARRIVALS_PAGE_URL,
    termsUrl: "https://www.jnto.go.jp/site-info/site-policy.html",
    rateLimit: { minIntervalMs: 5_000, requestsPerMinute: 6 },
    metadata: {
      acquisition: "official_bulk_excel",
      scheduleUrl: JP_JNTO_VISITOR_ARRIVALS_SCHEDULE_URL,
      attribution: "Source: Japan National Tourism Organization (JNTO).",
    },
  };
  await prisma.dataSource.upsert({
    where: { id: JP_JNTO_VISITOR_ARRIVALS_SOURCE_ID },
    create: { id: JP_JNTO_VISITOR_ARRIVALS_SOURCE_ID, ...source },
    update: source,
  });

  const now = new Date();
  for (const series of JP_JNTO_VISITOR_ARRIVALS_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: series.instrumentCode } });
    const previous =
      existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? existing.metadata
        : {};
    const metadata = {
      ...previous,
      sourceTag: "jp-jnto-visitor-arrivals-official-xlsx",
      countryCode: "JP",
      countryNameZh: "日本",
      catalogKey: `mds:${series.instrumentCode}`,
      catalogCategory: "对外与汇率",
      catalogSubcategory: "入境旅游",
      displayName: series.label,
      bootstrapOnly: false,
      source: "日本政府观光局（JNTO）",
      officialUrl: JP_JNTO_VISITOR_ARRIVALS_PAGE_URL,
      sourceUrl: JP_JNTO_VISITOR_ARRIVALS_PAGE_URL,
      scheduleUrl: JP_JNTO_VISITOR_ARRIVALS_SCHEDULE_URL,
      knownNextReleaseAt: JP_JNTO_NEXT_PUBLISHED_RELEASE_AT,
      unit: "人次",
      sourceUnit: "人",
      freqLabel: "月",
      seasonalAdjustment: "NSA",
      geography: "日本全国",
      nationality: series.sourceRowLabel,
      historyStart: JP_JNTO_VISITOR_ARRIVALS_HISTORY_START,
      definition:
        "基于法务省出入国管理统计，由JNTO计算的访日外客入境人次；按入境次数计数，排除以日本为主要居住国的永住者和乘员，包含过境、驻在人员家属及留学生等。分市场序列按国籍而非出发地统计。",
      revisionLifecycle:
        "观测次月先发布推计值（百人位），推计值发布两个月后改为暫定值（个位）；次年7月法务省年报确定后改为确报。每次读取滚动全表，订阅回看24个月，版本账本捕获修订。",
      sourceUpdateNote:
        "官方滚动时序XLSX。只保存原始月度人数，不保存表内同比与累计派生列。2020-2022疫情与边境限制导致真实水平断崖，不是解析缺口或统计口径拼接。当前版本账本证明抓取时点可见值，不代表历史首发PIT。",
      scrape: {
        provider: JP_JNTO_VISITOR_ARRIVALS_PROVIDER,
        pageUrl: JP_JNTO_VISITOR_ARRIVALS_PAGE_URL,
        sourceRow: series.sourceRowLabel,
        script: JP_JNTO_VISITOR_ARRIVALS_SYNC_SCRIPT,
      },
      fetchAcquisition: {
        status: "known",
        probedAt: now.toISOString(),
        method: "jp_jnto_official_rolling_xlsx",
        methodLabel: JP_JNTO_VISITOR_ARRIVALS_SYNC_SCRIPT,
        fetchUrl: JP_JNTO_VISITOR_ARRIVALS_PAGE_URL,
        officialUrl: JP_JNTO_VISITOR_ARRIVALS_PAGE_URL,
        message: "从JNTO统计页发现带时间戳的国籍/月别访日外客数官方XLSX",
      },
      attribution: "Source: Japan National Tourism Organization (JNTO); Chinese labels translated by finance-site.",
    };
    const instrumentFields = {
      name: `日本：${series.label}`,
      shortName: series.label,
      freqLabel: "月",
      unit: "人次",
      metadata,
      externalRefs: {
        catalogKey: `mds:${series.instrumentCode}`,
        sourceId: JP_JNTO_VISITOR_ARRIVALS_SOURCE_ID,
        agencyId: "jp-jnto",
        sourceRow: series.sourceRowLabel,
      },
    };
    const instrument = await prisma.instrument.upsert({
      where: { code: series.instrumentCode },
      create: { code: series.instrumentCode, kind: InstrumentKind.MACRO_SERIES, ...instrumentFields },
      update: instrumentFields,
    });
    const subscriptionFields = {
      sourceId: JP_JNTO_VISITOR_ARRIVALS_SOURCE_ID,
      sourceSeriesKey: series.instrumentCode,
      fetchMethod: DataFetchMethod.BULK_DOWNLOAD,
      granularity: DataGranularity.MONTHLY,
      timezone: "Asia/Tokyo",
      releaseRule: releaseRule as object,
      revisionLookback: 24,
      enabled: true,
      priority: 9,
    };
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        ...subscriptionFields,
        nextRunAt: initialNextRunAt(now),
      },
      update: subscriptionFields,
    });
    console.log(`seed ${series.instrumentCode}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "JNTO visitor arrivals seed failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

