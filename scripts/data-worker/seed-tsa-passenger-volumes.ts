/**
 * TSA 安检口旅客通过人数抓取——种子（数据源 + 仪器 + 订阅 + scrape metadata）
 *
 * npm run data:seed-tsa-passenger-volumes
 * Agent C 实跑（2026-09）：HTML 表格抓取，非 FRED 序列（已核实），回填深度上限
 * 2019-01-01（页面自身限制：无更早年度归档页）
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
  TSA_PASSENGER_VOLUMES_INSTRUMENT,
  TSA_PASSENGER_VOLUMES_SYNC_SCRIPT,
  TSA_SOURCE,
} from "../../src/lib/data/scheduler/tsaPassengerVolumes/catalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

/** 日频（M-F 更新），无 TE 日历事件 → 每日 probe */
const RELEASE_RULE = { type: "probe_interval" as const, intervalHours: 24 };

async function main() {
  console.log("[data:seed-tsa-passenger-volumes] 机构 + 数据源…");
  await prisma.statisticalAgency.upsert({
    where: { id: TSA_SOURCE.agencyId },
    create: {
      id: TSA_SOURCE.agencyId,
      countryCode: "US",
      nameZh: TSA_SOURCE.nameZh,
      nameEn: TSA_SOURCE.nameEn,
      websiteUrl: TSA_SOURCE.websiteUrl,
    },
    update: { nameZh: TSA_SOURCE.nameZh, nameEn: TSA_SOURCE.nameEn, websiteUrl: TSA_SOURCE.websiteUrl },
  });
  await prisma.dataSource.upsert({
    where: { id: TSA_SOURCE.id },
    create: {
      id: TSA_SOURCE.id,
      agencyId: TSA_SOURCE.agencyId,
      name: TSA_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: TSA_SOURCE.baseUrl,
      termsUrl: TSA_SOURCE.termsUrl,
      rateLimit: { requestsPerMinute: 6, minIntervalMs: 5000 },
    },
    update: {
      agencyId: TSA_SOURCE.agencyId,
      name: TSA_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: TSA_SOURCE.baseUrl,
      termsUrl: TSA_SOURCE.termsUrl,
    },
  });

  const row = TSA_PASSENGER_VOLUMES_INSTRUMENT;
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
      sourceTag: "tsa-passenger-volumes-scrape",
      bootstrapOnly: false,
      source: "TSA",
      providerNote: "Transportation Security Administration",
      sourceUrl: TSA_SOURCE.baseUrl,
      officialUrl: TSA_SOURCE.baseUrl,
      countryCode: row.countryCode,
      countryNameZh: "美国",
      displayName: row.displayName,
      catalogCategory: row.category,
      freqLabel: row.freqLabel,
      unit: row.unit,
      sourceUpdateNote: "TSA 官网每工作日上午 9 点前更新前一日安检口通过人数",
      dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10) ?? undefined,
      scrape: {
        provider: "tsa_passenger_volumes",
        url: TSA_SOURCE.baseUrl,
        script: TSA_PASSENGER_VOLUMES_SYNC_SCRIPT,
      },
    },
    {
      status: "known",
      probedAt: new Date().toISOString(),
      method: "tsa_passenger_volumes_scrape",
      methodLabel: TSA_PASSENGER_VOLUMES_SYNC_SCRIPT,
      fetchUrl: TSA_SOURCE.baseUrl,
      officialUrl: TSA_SOURCE.baseUrl,
      message: "TSA checkpoint travel numbers HTML 表格抓取（回填深度上限 2019-01-01）",
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
      externalRefs: { catalogKey: `mds:${row.code}`, agencyId: TSA_SOURCE.agencyId, sourceId: TSA_SOURCE.id },
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
      sourceId: TSA_SOURCE.id,
      sourceSeriesKey: row.code,
      fetchMethod: DataFetchMethod.API,
      granularity: DataGranularity.DAILY,
      releaseRule: RELEASE_RULE,
      nextRunAt,
      enabled: true,
      priority: 8,
    },
    update: {
      sourceId: TSA_SOURCE.id,
      sourceSeriesKey: row.code,
      granularity: DataGranularity.DAILY,
      releaseRule: RELEASE_RULE,
      enabled: true,
      ...(nextRunAt ? { nextRunAt } : {}),
    },
  });

  console.log(`[data:seed-tsa-passenger-volumes] ✓ ${row.code}（${existing ? "updated" : "created"}）`);
  console.log(
    "  下一步：npm run data:sync-tsa-passenger-volumes（回填）&& npm run data:verify-tsa-passenger-volumes -- --db",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
