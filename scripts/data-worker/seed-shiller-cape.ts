/**
 * Shiller CAPE 抓取——种子（数据源 + 仪器 + 订阅 + scrape metadata）
 *
 * npm run data:seed-shiller-cape
 * 源：multpl.com/shiller-pe/table/by-month（Yale ie_data.xls 已停更 2023-09，弃用，见 catalog.ts 注释）
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
  SHILLER_CAPE_INSTRUMENT,
  SHILLER_CAPE_PAGE_URL,
  SHILLER_CAPE_SYNC_SCRIPT,
  SHILLER_CAPE_SOURCE,
} from "../../src/lib/data/scheduler/shillerCape/catalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

/** 月频、无 TE 日历事件 → 定期探测（每周），源站每月更新一次 */
const RELEASE_RULE = { type: "probe_interval" as const, intervalHours: 168 };

async function main() {
  console.log("[data:seed-shiller-cape] 机构 + 数据源…");
  await prisma.statisticalAgency.upsert({
    where: { id: SHILLER_CAPE_SOURCE.agencyId },
    create: {
      id: SHILLER_CAPE_SOURCE.agencyId,
      countryCode: "US",
      nameZh: SHILLER_CAPE_SOURCE.nameZh,
      nameEn: SHILLER_CAPE_SOURCE.nameEn,
      websiteUrl: SHILLER_CAPE_SOURCE.websiteUrl,
    },
    update: {
      nameZh: SHILLER_CAPE_SOURCE.nameZh,
      nameEn: SHILLER_CAPE_SOURCE.nameEn,
      websiteUrl: SHILLER_CAPE_SOURCE.websiteUrl,
    },
  });
  await prisma.dataSource.upsert({
    where: { id: SHILLER_CAPE_SOURCE.id },
    create: {
      id: SHILLER_CAPE_SOURCE.id,
      agencyId: SHILLER_CAPE_SOURCE.agencyId,
      name: SHILLER_CAPE_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: SHILLER_CAPE_SOURCE.baseUrl,
      termsUrl: SHILLER_CAPE_SOURCE.termsUrl,
      rateLimit: { requestsPerMinute: 6, minIntervalMs: 5000 },
    },
    update: {
      agencyId: SHILLER_CAPE_SOURCE.agencyId,
      name: SHILLER_CAPE_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: SHILLER_CAPE_SOURCE.baseUrl,
      termsUrl: SHILLER_CAPE_SOURCE.termsUrl,
    },
  });

  const row = SHILLER_CAPE_INSTRUMENT;
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
      sourceTag: "shiller-cape-scrape",
      bootstrapOnly: false,
      source: "multpl.com（原始方法：Robert Shiller，Yale）",
      providerNote: "multpl.com（Yale 官方 ie_data.xls 已停更 2023-09，弃用改用此镜像）",
      sourceUrl: SHILLER_CAPE_PAGE_URL,
      officialUrl: SHILLER_CAPE_PAGE_URL,
      countryCode: row.countryCode,
      countryNameZh: "美国",
      displayName: row.displayName,
      catalogCategory: row.category,
      freqLabel: row.freqLabel,
      unit: row.unit,
      sourceUpdateNote: "周期调整市盈率（CAPE/P·E10），月度更新",
      dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10) ?? undefined,
      scrape: {
        provider: "shiller_cape",
        url: SHILLER_CAPE_PAGE_URL,
        script: SHILLER_CAPE_SYNC_SCRIPT,
      },
    },
    {
      status: "known",
      probedAt: new Date().toISOString(),
      method: "shiller_cape_scrape",
      methodLabel: SHILLER_CAPE_SYNC_SCRIPT,
      fetchUrl: SHILLER_CAPE_PAGE_URL,
      officialUrl: SHILLER_CAPE_PAGE_URL,
      message: "multpl.com Shiller CAPE 月度历史表 HTML 抓取",
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
      externalRefs: {
        catalogKey: `mds:${row.code}`,
        agencyId: SHILLER_CAPE_SOURCE.agencyId,
        sourceId: SHILLER_CAPE_SOURCE.id,
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
      sourceId: SHILLER_CAPE_SOURCE.id,
      sourceSeriesKey: row.code,
      fetchMethod: DataFetchMethod.API,
      granularity: DataGranularity.MONTHLY,
      releaseRule: RELEASE_RULE,
      nextRunAt,
      enabled: true,
      priority: 8,
    },
    update: {
      sourceId: SHILLER_CAPE_SOURCE.id,
      sourceSeriesKey: row.code,
      granularity: DataGranularity.MONTHLY,
      releaseRule: RELEASE_RULE,
      enabled: true,
      ...(nextRunAt ? { nextRunAt } : {}),
    },
  });

  console.log(`[data:seed-shiller-cape] ✓ ${row.code}（${existing ? "updated" : "created"}）`);
  console.log("  下一步：npm run data:sync-shiller-cape（回填）&& npm run data:verify-shiller-cape -- --db");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
