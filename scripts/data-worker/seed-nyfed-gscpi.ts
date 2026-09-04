/**
 * NY Fed 全球供应链压力指数（GSCPI）抓取——种子（数据源 + 仪器 + 订阅 + scrape metadata）
 *
 * npm run data:seed-nyfed-gscpi
 * Agent C 实跑：FRED 无对应序列，官方 Excel 抓取（C3 web-scrape-onboarding）
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
  NYFED_GSCPI_INSTRUMENT,
  NYFED_GSCPI_PAGE_URL,
  NYFED_GSCPI_SYNC_SCRIPT,
  NYFED_GSCPI_XLS_URL,
  NYFED_GSCPI_SOURCE,
} from "../../src/lib/data/scheduler/nyFedGscpi/catalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

/** 月频、无 TE 日历事件 → 定期探测（72 小时，参考 us.chicagofed.cfnai），源站每月更新一次 */
const RELEASE_RULE = { type: "probe_interval" as const, intervalHours: 72 };

async function main() {
  console.log("[data:seed-nyfed-gscpi] 机构 + 数据源…");
  await prisma.statisticalAgency.upsert({
    where: { id: NYFED_GSCPI_SOURCE.agencyId },
    create: {
      id: NYFED_GSCPI_SOURCE.agencyId,
      countryCode: "US",
      nameZh: NYFED_GSCPI_SOURCE.nameZh,
      nameEn: NYFED_GSCPI_SOURCE.nameEn,
      websiteUrl: NYFED_GSCPI_SOURCE.websiteUrl,
    },
    update: { nameZh: NYFED_GSCPI_SOURCE.nameZh, nameEn: NYFED_GSCPI_SOURCE.nameEn, websiteUrl: NYFED_GSCPI_SOURCE.websiteUrl },
  });
  await prisma.dataSource.upsert({
    where: { id: NYFED_GSCPI_SOURCE.id },
    create: {
      id: NYFED_GSCPI_SOURCE.id,
      agencyId: NYFED_GSCPI_SOURCE.agencyId,
      name: NYFED_GSCPI_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: NYFED_GSCPI_SOURCE.baseUrl,
      termsUrl: NYFED_GSCPI_SOURCE.termsUrl,
      rateLimit: { requestsPerMinute: 6, minIntervalMs: 5000 },
    },
    update: {
      agencyId: NYFED_GSCPI_SOURCE.agencyId,
      name: NYFED_GSCPI_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: NYFED_GSCPI_SOURCE.baseUrl,
      termsUrl: NYFED_GSCPI_SOURCE.termsUrl,
    },
  });

  const row = NYFED_GSCPI_INSTRUMENT;
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
      sourceTag: "nyfed-gscpi-scrape",
      bootstrapOnly: false,
      source: "NY Fed",
      providerNote: "Federal Reserve Bank of New York",
      sourceUrl: NYFED_GSCPI_PAGE_URL,
      officialUrl: NYFED_GSCPI_PAGE_URL,
      countryCode: row.countryCode,
      countryNameZh: "美国",
      displayName: row.displayName,
      catalogCategory: row.category,
      freqLabel: row.freqLabel,
      unit: row.unit,
      sourceUpdateNote: "运输成本+制造业指标 PCA 合成的供应链压力指数，月度更新",
      dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10) ?? undefined,
      scrape: {
        provider: "nyfed_gscpi",
        url: NYFED_GSCPI_XLS_URL,
        script: NYFED_GSCPI_SYNC_SCRIPT,
      },
    },
    {
      status: "known",
      probedAt: new Date().toISOString(),
      method: "nyfed_gscpi_scrape",
      methodLabel: NYFED_GSCPI_SYNC_SCRIPT,
      fetchUrl: NYFED_GSCPI_XLS_URL,
      officialUrl: NYFED_GSCPI_PAGE_URL,
      message: "NY Fed gscpi_data.xlsx（GSCPI Monthly Data sheet）Excel 抓取",
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
      externalRefs: { catalogKey: `mds:${row.code}`, agencyId: NYFED_GSCPI_SOURCE.agencyId, sourceId: NYFED_GSCPI_SOURCE.id },
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
      sourceId: NYFED_GSCPI_SOURCE.id,
      sourceSeriesKey: row.code,
      fetchMethod: DataFetchMethod.API,
      granularity: DataGranularity.MONTHLY,
      releaseRule: RELEASE_RULE,
      nextRunAt,
      enabled: true,
      priority: 8,
    },
    update: {
      sourceId: NYFED_GSCPI_SOURCE.id,
      sourceSeriesKey: row.code,
      granularity: DataGranularity.MONTHLY,
      releaseRule: RELEASE_RULE,
      enabled: true,
      ...(nextRunAt ? { nextRunAt } : {}),
    },
  });

  console.log(`[data:seed-nyfed-gscpi] ✓ ${row.code}（${existing ? "updated" : "created"}）`);
  console.log("  下一步：npm run data:sync-nyfed-gscpi（回填）&& npm run data:verify-nyfed-gscpi -- --db");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
