/**
 * NY Fed 衰退概率抓取——种子（数据源 + 仪器 + 订阅 + scrape metadata）
 *
 * npm run data:seed-nyfed-recession
 * Agent C 实跑：docs/specs（无 FRED 对应，官方 Excel 抓取）
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
  NYFED_RECESSION_INSTRUMENT,
  NYFED_RECESSION_PAGE_URL,
  NYFED_RECESSION_SYNC_SCRIPT,
  NYFED_RECESSION_XLS_URL,
  NYFED_SOURCE,
} from "../../src/lib/data/scheduler/nyFedRecession/catalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

/** 月频、无 TE 日历事件 → 定期探测（每周），源站每月更新一次 */
const RELEASE_RULE = { type: "probe_interval" as const, intervalHours: 168 };

async function main() {
  console.log("[data:seed-nyfed-recession] 机构 + 数据源…");
  await prisma.statisticalAgency.upsert({
    where: { id: NYFED_SOURCE.agencyId },
    create: {
      id: NYFED_SOURCE.agencyId,
      countryCode: "US",
      nameZh: NYFED_SOURCE.nameZh,
      nameEn: NYFED_SOURCE.nameEn,
      websiteUrl: NYFED_SOURCE.websiteUrl,
    },
    update: { nameZh: NYFED_SOURCE.nameZh, nameEn: NYFED_SOURCE.nameEn, websiteUrl: NYFED_SOURCE.websiteUrl },
  });
  await prisma.dataSource.upsert({
    where: { id: NYFED_SOURCE.id },
    create: {
      id: NYFED_SOURCE.id,
      agencyId: NYFED_SOURCE.agencyId,
      name: NYFED_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: NYFED_SOURCE.baseUrl,
      termsUrl: NYFED_SOURCE.termsUrl,
      rateLimit: { requestsPerMinute: 6, minIntervalMs: 5000 },
    },
    update: {
      agencyId: NYFED_SOURCE.agencyId,
      name: NYFED_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: NYFED_SOURCE.baseUrl,
      termsUrl: NYFED_SOURCE.termsUrl,
    },
  });

  const row = NYFED_RECESSION_INSTRUMENT;
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
      sourceTag: "nyfed-recession-scrape",
      bootstrapOnly: false,
      source: "NY Fed",
      providerNote: "Federal Reserve Bank of New York",
      sourceUrl: NYFED_RECESSION_PAGE_URL,
      officialUrl: NYFED_RECESSION_PAGE_URL,
      countryCode: row.countryCode,
      countryNameZh: "美国",
      displayName: row.displayName,
      catalogCategory: row.category,
      freqLabel: row.freqLabel,
      unit: row.unit,
      sourceUpdateNote: "NY Fed 收益率曲线模型，月度更新",
      dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10) ?? undefined,
      scrape: {
        provider: "nyfed_recession",
        url: NYFED_RECESSION_XLS_URL,
        script: NYFED_RECESSION_SYNC_SCRIPT,
      },
    },
    {
      status: "known",
      probedAt: new Date().toISOString(),
      method: "nyfed_recession_scrape",
      methodLabel: NYFED_RECESSION_SYNC_SCRIPT,
      fetchUrl: NYFED_RECESSION_XLS_URL,
      officialUrl: NYFED_RECESSION_PAGE_URL,
      message: "NY Fed allmonth.xls（rec_prob sheet）Excel 抓取",
    },
  );

  const instrument = await prisma.instrument.upsert({
    where: { code: row.code },
    create: {
      code: row.code,
      kind: InstrumentKind.MACRO_SERIES,
      name: row.name,
      freqLabel: row.freqLabel,
      unit: row.unit,
      metadata: metadata as object,
      externalRefs: { catalogKey: `mds:${row.code}`, agencyId: NYFED_SOURCE.agencyId, sourceId: NYFED_SOURCE.id },
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
      sourceId: NYFED_SOURCE.id,
      sourceSeriesKey: row.code,
      fetchMethod: DataFetchMethod.API,
      granularity: DataGranularity.MONTHLY,
      releaseRule: RELEASE_RULE,
      nextRunAt,
      enabled: true,
      priority: 8,
    },
    update: {
      sourceId: NYFED_SOURCE.id,
      sourceSeriesKey: row.code,
      granularity: DataGranularity.MONTHLY,
      releaseRule: RELEASE_RULE,
      enabled: true,
      ...(nextRunAt ? { nextRunAt } : {}),
    },
  });

  console.log(`[data:seed-nyfed-recession] ✓ ${row.code}（${existing ? "updated" : "created"}）`);
  console.log("  下一步：npm run data:sync-nyfed-recession（回填）&& npm run data:verify-nyfed-recession -- --db");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
