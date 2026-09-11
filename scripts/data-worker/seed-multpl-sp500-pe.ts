/**
 * 标普500 市盈率（multpl.com）——种子（仪器 + 订阅 + scrape metadata）
 *
 * npm run data:seed-multpl-sp500-pe
 * 数据源复用 Shiller CAPE 的 `multpl`（同站同表结构）；本脚本仅在缺失时创建，不改其配置。
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
import { SHILLER_CAPE_SOURCE } from "../../src/lib/data/scheduler/shillerCape/catalog";
import {
  MULTPL_SP500_PE_INSTRUMENT,
  MULTPL_SP500_PE_PAGE_URL,
  MULTPL_SP500_PE_RELEASE_RULE,
  MULTPL_SP500_PE_SYNC_SCRIPT,
} from "../../src/lib/data/scheduler/multplSp500Pe/catalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

async function ensureMultplSource() {
  await prisma.statisticalAgency.upsert({
    where: { id: SHILLER_CAPE_SOURCE.agencyId },
    create: {
      id: SHILLER_CAPE_SOURCE.agencyId,
      countryCode: "US",
      nameZh: SHILLER_CAPE_SOURCE.nameZh,
      nameEn: SHILLER_CAPE_SOURCE.nameEn,
      websiteUrl: SHILLER_CAPE_SOURCE.websiteUrl,
    },
    update: {},
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
    update: {},
  });
}

async function main() {
  console.log("[data:seed-multpl-sp500-pe] 数据源（复用 multpl）…");
  await ensureMultplSource();

  const row = MULTPL_SP500_PE_INSTRUMENT;
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
      sourceTag: "multpl-sp500-pe-scrape",
      bootstrapOnly: false,
      source: "multpl.com（S&P 500 价格 / 过去12个月报告每股收益）",
      providerNote: "multpl.com；替代已退役的 US_Overview xlsx 列 usov_c28_sp500_pe（Wind）",
      sourceUrl: MULTPL_SP500_PE_PAGE_URL,
      officialUrl: MULTPL_SP500_PE_PAGE_URL,
      countryCode: row.countryCode,
      countryNameZh: "美国",
      displayName: row.displayName,
      catalogCategory: row.category,
      freqLabel: row.freqLabel,
      unit: row.unit,
      sourceUpdateNote: "标普500 市盈率（TTM 报告收益），月度；最新月份为估算值，随财报修订",
      dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10) ?? undefined,
      scrape: {
        provider: "multpl_sp500_pe",
        url: MULTPL_SP500_PE_PAGE_URL,
        script: MULTPL_SP500_PE_SYNC_SCRIPT,
      },
    },
    {
      status: "known",
      probedAt: new Date().toISOString(),
      method: "multpl_sp500_pe_scrape",
      methodLabel: MULTPL_SP500_PE_SYNC_SCRIPT,
      fetchUrl: MULTPL_SP500_PE_PAGE_URL,
      officialUrl: MULTPL_SP500_PE_PAGE_URL,
      message: "multpl.com 标普500 市盈率月度历史表 HTML 抓取",
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

  const nextRunAt = computeNextRunAt(MULTPL_SP500_PE_RELEASE_RULE, new Date());
  await prisma.dataSubscription.upsert({
    where: { instrumentId: instrument.id },
    create: {
      instrumentId: instrument.id,
      sourceId: SHILLER_CAPE_SOURCE.id,
      sourceSeriesKey: row.code,
      fetchMethod: DataFetchMethod.API,
      granularity: DataGranularity.MONTHLY,
      releaseRule: MULTPL_SP500_PE_RELEASE_RULE,
      nextRunAt,
      enabled: true,
      priority: 8,
    },
    update: {
      sourceId: SHILLER_CAPE_SOURCE.id,
      sourceSeriesKey: row.code,
      granularity: DataGranularity.MONTHLY,
      releaseRule: MULTPL_SP500_PE_RELEASE_RULE,
      enabled: true,
      ...(nextRunAt ? { nextRunAt } : {}),
    },
  });

  console.log(`[data:seed-multpl-sp500-pe] ✓ ${row.code}（${existing ? "updated" : "created"}）`);
  console.log("  下一步：npm run data:sync-multpl-sp500-pe（回填）&& npm run data:verify-multpl-sp500-pe -- --db");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
