/**
 * FINRA 客户融资余额统计（Margin Statistics）——种子（数据源 + 仪器 + 订阅 + scrape metadata）
 *
 * npm run data:seed-finra-margin-debt
 * Agent C 实跑：无 FRED 覆盖，官方 Excel 全量下载抓取（C3 web-scrape-onboarding）
 * 三条分项（融资余额/现金账户闲置资金/保证金账户闲置资金）共享同一份源文件。
 */
import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  DataGranularity,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";
import {
  FINRA_MARGIN_STATISTICS_SERIES,
  FINRA_MARGIN_STATISTICS_PAGE_URL,
  FINRA_MARGIN_STATISTICS_XLS_URL,
  FINRA_MARGIN_STATISTICS_SYNC_SCRIPT,
  FINRA_MARGIN_STATISTICS_SOURCE,
} from "../../src/lib/data/scheduler/finraMarginDebt/catalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

/** 月频、无 TE 日历事件 → 定期探测（72 小时，参考 us.nyfed.gscpi），源站通常次月第三周更新 */
const RELEASE_RULE = { type: "probe_interval" as const, intervalHours: 72 };

async function main() {
  console.log("[data:seed-finra-margin-debt] 机构 + 数据源…");
  await prisma.statisticalAgency.upsert({
    where: { id: FINRA_MARGIN_STATISTICS_SOURCE.agencyId },
    create: {
      id: FINRA_MARGIN_STATISTICS_SOURCE.agencyId,
      countryCode: "US",
      nameZh: FINRA_MARGIN_STATISTICS_SOURCE.nameZh,
      nameEn: FINRA_MARGIN_STATISTICS_SOURCE.nameEn,
      websiteUrl: FINRA_MARGIN_STATISTICS_SOURCE.websiteUrl,
    },
    update: {
      nameZh: FINRA_MARGIN_STATISTICS_SOURCE.nameZh,
      nameEn: FINRA_MARGIN_STATISTICS_SOURCE.nameEn,
      websiteUrl: FINRA_MARGIN_STATISTICS_SOURCE.websiteUrl,
    },
  });
  await prisma.dataSource.upsert({
    where: { id: FINRA_MARGIN_STATISTICS_SOURCE.id },
    create: {
      id: FINRA_MARGIN_STATISTICS_SOURCE.id,
      agencyId: FINRA_MARGIN_STATISTICS_SOURCE.agencyId,
      name: FINRA_MARGIN_STATISTICS_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: FINRA_MARGIN_STATISTICS_SOURCE.baseUrl,
      termsUrl: FINRA_MARGIN_STATISTICS_SOURCE.termsUrl,
      rateLimit: { requestsPerMinute: 6, minIntervalMs: 5000 },
    },
    update: {
      agencyId: FINRA_MARGIN_STATISTICS_SOURCE.agencyId,
      name: FINRA_MARGIN_STATISTICS_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: FINRA_MARGIN_STATISTICS_SOURCE.baseUrl,
      termsUrl: FINRA_MARGIN_STATISTICS_SOURCE.termsUrl,
    },
  });

  for (const row of FINRA_MARGIN_STATISTICS_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: row.instrumentCode } });
    const latestObs = existing
      ? await prisma.macroObservation.findFirst({
          where: { instrumentId: existing.id },
          orderBy: { obsDate: "desc" },
          select: { obsDate: true },
        })
      : null;
    const prevMd =
      existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {};

    const metadata = mergeFetchAcquisition(
      {
        ...prevMd,
        sourceTag: "finra-margin-statistics-scrape",
        bootstrapOnly: false,
        source: "FINRA",
        providerNote: FINRA_MARGIN_STATISTICS_SOURCE.nameEn,
        sourceUrl: row.officialUrl,
        officialUrl: row.officialUrl,
        countryCode: row.countryCode,
        countryNameZh: "美国",
        displayName: row.displayName,
        catalogCategory: row.category,
        freqLabel: row.freqLabel,
        unit: row.unit,
        sourceUpdateNote: row.sourceUpdateNote,
        dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10) ?? undefined,
        scrape: {
          provider: row.provider,
          url: FINRA_MARGIN_STATISTICS_XLS_URL,
          script: FINRA_MARGIN_STATISTICS_SYNC_SCRIPT,
        },
      },
      {
        status: "known",
        probedAt: new Date().toISOString(),
        method: "finra_margin_statistics_scrape",
        methodLabel: FINRA_MARGIN_STATISTICS_SYNC_SCRIPT,
        fetchUrl: FINRA_MARGIN_STATISTICS_XLS_URL,
        officialUrl: row.officialUrl,
        message: "FINRA margin-statistics.xlsx（Customer Margin Balances sheet）Excel 抓取",
      },
    );

    const instrument = await prisma.instrument.upsert({
      where: { code: row.instrumentCode },
      create: {
        code: row.instrumentCode,
        kind: InstrumentKind.MACRO_SERIES,
        name: row.name,
        freqLabel: row.freqLabel,
        unit: row.unit,
        metadata: metadata as object,
        externalRefs: {
          catalogKey: `mds:${row.instrumentCode}`,
          agencyId: FINRA_MARGIN_STATISTICS_SOURCE.agencyId,
          sourceId: FINRA_MARGIN_STATISTICS_SOURCE.id,
        },
      },
      update: {
        name: row.name,
        freqLabel: row.freqLabel,
        unit: row.unit,
        metadata: metadata as object,
      },
    });

    const nextRunAt = computeNextRunAt(RELEASE_RULE, new Date());
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        sourceId: FINRA_MARGIN_STATISTICS_SOURCE.id,
        sourceSeriesKey: row.instrumentCode,
        fetchMethod: DataFetchMethod.API,
        granularity: DataGranularity.MONTHLY,
        releaseRule: RELEASE_RULE,
        nextRunAt,
        enabled: true,
        priority: 8,
      },
      update: {
        sourceId: FINRA_MARGIN_STATISTICS_SOURCE.id,
        sourceSeriesKey: row.instrumentCode,
        granularity: DataGranularity.MONTHLY,
        releaseRule: RELEASE_RULE,
        enabled: true,
        ...(nextRunAt ? { nextRunAt } : {}),
      },
    });

    console.log(`  ✓ ${row.instrumentCode}（${existing ? "updated" : "created"}）`);
  }

  console.log(
    "[data:seed-finra-margin-debt] 下一步：npm run data:sync-finra-margin-debt（回填）&& npm run data:verify-finra-margin-debt -- --db",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
