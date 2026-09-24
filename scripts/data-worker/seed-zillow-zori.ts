/**
 * Zillow 观测租金指数（ZORI，全美）——种子（机构 + 数据源 + 仪器 + 订阅 + scrape metadata）
 *
 * npm run data:seed-zillow-zori
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
  ZILLOW_RESEARCH_DATA_URL,
  ZILLOW_ZORI_CSV_URL,
  ZILLOW_ZORI_INSTRUMENT,
  ZILLOW_ZORI_SOURCE,
  ZILLOW_ZORI_SYNC_SCRIPT,
} from "../../src/lib/data/scheduler/zillowZori/catalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

/** 月频、无固定发布日历（每月中旬整表重发）→ 72 小时探测，与 NY Fed GSCPI 等月频抓取一致 */
const RELEASE_RULE = { type: "probe_interval" as const, intervalHours: 72 };

async function main() {
  console.log("[data:seed-zillow-zori] 机构 + 数据源…");
  await prisma.statisticalAgency.upsert({
    where: { id: ZILLOW_ZORI_SOURCE.agencyId },
    create: {
      id: ZILLOW_ZORI_SOURCE.agencyId,
      countryCode: "US",
      nameZh: ZILLOW_ZORI_SOURCE.nameZh,
      nameEn: ZILLOW_ZORI_SOURCE.nameEn,
      websiteUrl: ZILLOW_ZORI_SOURCE.websiteUrl,
    },
    update: {
      nameZh: ZILLOW_ZORI_SOURCE.nameZh,
      nameEn: ZILLOW_ZORI_SOURCE.nameEn,
      websiteUrl: ZILLOW_ZORI_SOURCE.websiteUrl,
    },
  });
  await prisma.dataSource.upsert({
    where: { id: ZILLOW_ZORI_SOURCE.id },
    create: {
      id: ZILLOW_ZORI_SOURCE.id,
      agencyId: ZILLOW_ZORI_SOURCE.agencyId,
      name: ZILLOW_ZORI_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: ZILLOW_ZORI_SOURCE.baseUrl,
      termsUrl: ZILLOW_ZORI_SOURCE.termsUrl,
      rateLimit: { requestsPerMinute: 6, minIntervalMs: 5000 },
    },
    update: {
      agencyId: ZILLOW_ZORI_SOURCE.agencyId,
      name: ZILLOW_ZORI_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: ZILLOW_ZORI_SOURCE.baseUrl,
      termsUrl: ZILLOW_ZORI_SOURCE.termsUrl,
    },
  });

  const row = ZILLOW_ZORI_INSTRUMENT;
  const existing = await prisma.instrument.findUnique({ where: { code: row.code } });
  const latestObs = await prisma.macroObservation.findFirst({
    where: { instrument: { code: row.code } },
    orderBy: { obsDate: "desc" },
    select: { obsDate: true },
  });
  const prevMd =
    existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? (existing.metadata as Record<string, unknown>)
      : {};

  const metadata = mergeFetchAcquisition(
    {
      ...prevMd,
      sourceTag: "zillow-zori-scrape",
      bootstrapOnly: false,
      source: "Zillow Research",
      providerNote: ZILLOW_ZORI_SOURCE.attribution,
      attribution: ZILLOW_ZORI_SOURCE.attribution,
      sourceUrl: ZILLOW_RESEARCH_DATA_URL,
      officialUrl: ZILLOW_RESEARCH_DATA_URL,
      countryCode: row.countryCode,
      countryNameZh: "美国",
      displayName: row.displayName,
      nameEn: row.nameEn,
      catalogCategory: row.category,
      freqLabel: row.freqLabel,
      unit: row.unit,
      sourceUpdateNote: "新签租约市场租金（重复租金法，按租赁存量加权），平滑+季调；每月中旬整表重发并修订历史",
      dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10) ?? undefined,
      scrape: {
        provider: "zillow_zori",
        url: ZILLOW_ZORI_CSV_URL,
        script: ZILLOW_ZORI_SYNC_SCRIPT,
      },
    },
    {
      status: "known",
      probedAt: new Date().toISOString(),
      method: "zillow_zori_csv",
      methodLabel: ZILLOW_ZORI_SYNC_SCRIPT,
      fetchUrl: ZILLOW_ZORI_CSV_URL,
      officialUrl: ZILLOW_RESEARCH_DATA_URL,
      message: "Zillow Research 公开 CSV（Metro & U.S.，全美行）",
    },
  );

  const instrument = await prisma.instrument.upsert({
    where: { code: row.code },
    create: {
      code: row.code,
      kind: InstrumentKind.MACRO_SERIES,
      name: row.name,
      nameEn: row.nameEn,
      freqLabel: row.freqLabel,
      unit: row.unit,
      metadata: metadata as object,
      externalRefs: {
        catalogKey: `mds:${row.code}`,
        agencyId: ZILLOW_ZORI_SOURCE.agencyId,
        sourceId: ZILLOW_ZORI_SOURCE.id,
      },
    },
    update: {
      name: row.name,
      nameEn: row.nameEn,
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
      sourceId: ZILLOW_ZORI_SOURCE.id,
      sourceSeriesKey: row.code,
      fetchMethod: DataFetchMethod.API,
      granularity: DataGranularity.MONTHLY,
      releaseRule: RELEASE_RULE,
      nextRunAt,
      enabled: true,
      priority: 8,
    },
    update: {
      sourceId: ZILLOW_ZORI_SOURCE.id,
      sourceSeriesKey: row.code,
      granularity: DataGranularity.MONTHLY,
      releaseRule: RELEASE_RULE,
      enabled: true,
      ...(nextRunAt ? { nextRunAt } : {}),
    },
  });

  console.log(`[data:seed-zillow-zori] ✓ ${row.code}（${existing ? "updated" : "created"}）`);
  console.log("  下一步：npm run data:sync-zillow-zori（回填）&& npm run data:verify-zillow-zori -- --db");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
