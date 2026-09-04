/**
 * Damodaran 隐含股权风险溢价抓取——种子（数据源 + 仪器 + 订阅 + scrape metadata）
 *
 * npm run data:seed-damodaran-erp
 * Agent C 实跑：无 FRED 对应，NYU Stern 官方 Excel 抓取
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
  DAMODARAN_ERP_INSTRUMENT,
  DAMODARAN_ERP_PAGE_URL,
  DAMODARAN_ERP_SYNC_SCRIPT,
  DAMODARAN_ERP_XLS_URL,
  DAMODARAN_SOURCE,
} from "../../src/lib/data/scheduler/damodaranErp/catalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

/** 年度数据，每年 1 月更新一次 → 定期探测（每月一次足够） */
const RELEASE_RULE = { type: "probe_interval" as const, intervalHours: 720 };

async function main() {
  console.log("[data:seed-damodaran-erp] 机构 + 数据源…");
  await prisma.statisticalAgency.upsert({
    where: { id: DAMODARAN_SOURCE.agencyId },
    create: {
      id: DAMODARAN_SOURCE.agencyId,
      countryCode: "US",
      nameZh: DAMODARAN_SOURCE.nameZh,
      nameEn: DAMODARAN_SOURCE.nameEn,
      websiteUrl: DAMODARAN_SOURCE.websiteUrl,
    },
    update: { nameZh: DAMODARAN_SOURCE.nameZh, nameEn: DAMODARAN_SOURCE.nameEn, websiteUrl: DAMODARAN_SOURCE.websiteUrl },
  });
  await prisma.dataSource.upsert({
    where: { id: DAMODARAN_SOURCE.id },
    create: {
      id: DAMODARAN_SOURCE.id,
      agencyId: DAMODARAN_SOURCE.agencyId,
      name: DAMODARAN_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: DAMODARAN_SOURCE.baseUrl,
      termsUrl: DAMODARAN_SOURCE.termsUrl,
      rateLimit: { requestsPerMinute: 6, minIntervalMs: 5000 },
    },
    update: {
      agencyId: DAMODARAN_SOURCE.agencyId,
      name: DAMODARAN_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: DAMODARAN_SOURCE.baseUrl,
      termsUrl: DAMODARAN_SOURCE.termsUrl,
    },
  });

  const row = DAMODARAN_ERP_INSTRUMENT;
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
      sourceTag: "damodaran-erp-scrape",
      bootstrapOnly: false,
      source: "Aswath Damodaran (NYU Stern)",
      providerNote: "NYU Stern School of Business",
      sourceUrl: DAMODARAN_ERP_PAGE_URL,
      officialUrl: DAMODARAN_ERP_PAGE_URL,
      countryCode: row.countryCode,
      countryNameZh: "美国",
      displayName: row.displayName,
      catalogCategory: row.category,
      freqLabel: row.freqLabel,
      unit: row.unit,
      sourceUpdateNote: "两阶段 FCFE 股利折现模型隐含 ERP，年度更新（每年 1 月）",
      dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10) ?? undefined,
      scrape: {
        provider: "damodaran_erp",
        url: DAMODARAN_ERP_XLS_URL,
        script: DAMODARAN_ERP_SYNC_SCRIPT,
      },
    },
    {
      status: "known",
      probedAt: new Date().toISOString(),
      method: "damodaran_erp_scrape",
      methodLabel: DAMODARAN_ERP_SYNC_SCRIPT,
      fetchUrl: DAMODARAN_ERP_XLS_URL,
      officialUrl: DAMODARAN_ERP_PAGE_URL,
      message: "Damodaran histimpl.xls（Historical Impl Premiums sheet）Excel 抓取",
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
      externalRefs: { catalogKey: `mds:${row.code}`, agencyId: DAMODARAN_SOURCE.agencyId, sourceId: DAMODARAN_SOURCE.id },
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
      sourceId: DAMODARAN_SOURCE.id,
      sourceSeriesKey: row.code,
      fetchMethod: DataFetchMethod.API,
      granularity: DataGranularity.ANNUAL,
      releaseRule: RELEASE_RULE,
      nextRunAt,
      enabled: true,
      priority: 8,
    },
    update: {
      sourceId: DAMODARAN_SOURCE.id,
      sourceSeriesKey: row.code,
      granularity: DataGranularity.ANNUAL,
      releaseRule: RELEASE_RULE,
      enabled: true,
      ...(nextRunAt ? { nextRunAt } : {}),
    },
  });

  console.log(`[data:seed-damodaran-erp] ✓ ${row.code}（${existing ? "updated" : "created"}）`);
  console.log("  下一步：npm run data:sync-damodaran-erp（回填）&& npm run data:verify-damodaran-erp -- --db");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
