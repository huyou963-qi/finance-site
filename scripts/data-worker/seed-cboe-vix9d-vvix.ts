/**
 * CBOE VIX9D / VVIX 抓取——种子（数据源 + 仪器 + 订阅 + scrape metadata）
 *
 * npm run data:seed-cboe-vix9d-vvix
 * Agent C 实跑（2026-09）：CSV 结构化抓取，非 FRED 序列（已核实）
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
  CBOE_INDEX_SERIES,
  CBOE_INDICES_SYNC_SCRIPT,
  CBOE_SOURCE,
} from "../../src/lib/data/scheduler/cboeIndices/catalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

/** 日频、无 TE 日历事件 → 每日 probe */
const RELEASE_RULE = { type: "probe_interval" as const, intervalHours: 24 };

async function main() {
  console.log("[data:seed-cboe-vix9d-vvix] 机构 + 数据源…");
  await prisma.statisticalAgency.upsert({
    where: { id: CBOE_SOURCE.agencyId },
    create: {
      id: CBOE_SOURCE.agencyId,
      countryCode: "US",
      nameZh: CBOE_SOURCE.nameZh,
      nameEn: CBOE_SOURCE.nameEn,
      websiteUrl: CBOE_SOURCE.websiteUrl,
    },
    update: {
      nameZh: CBOE_SOURCE.nameZh,
      nameEn: CBOE_SOURCE.nameEn,
      websiteUrl: CBOE_SOURCE.websiteUrl,
    },
  });
  await prisma.dataSource.upsert({
    where: { id: CBOE_SOURCE.id },
    create: {
      id: CBOE_SOURCE.id,
      agencyId: CBOE_SOURCE.agencyId,
      name: CBOE_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: CBOE_SOURCE.baseUrl,
      termsUrl: CBOE_SOURCE.termsUrl,
      rateLimit: { requestsPerMinute: 6, minIntervalMs: 5000 },
    },
    update: {
      agencyId: CBOE_SOURCE.agencyId,
      name: CBOE_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: CBOE_SOURCE.baseUrl,
      termsUrl: CBOE_SOURCE.termsUrl,
    },
  });

  for (const row of CBOE_INDEX_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: row.instrumentCode } });
    const latestObs = await prisma.macroObservation.findFirst({
      where: { instrument: { code: row.instrumentCode } },
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
        sourceTag: "cboe-indices-scrape",
        bootstrapOnly: false,
        source: "CBOE",
        providerNote: "Cboe Global Markets",
        sourceUrl: row.officialUrl,
        officialUrl: row.officialUrl,
        countryCode: row.countryCode,
        countryNameZh: "美国",
        displayName: row.displayName,
        catalogCategory: row.category,
        freqLabel: row.freqLabel,
        unit: row.unit,
        sourceUpdateNote: "CBOE 官方 CSV，交易日收盘后更新",
        dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10) ?? undefined,
        scrape: {
          provider: row.provider,
          url: row.csvUrl,
          series: row.seriesKey,
          script: CBOE_INDICES_SYNC_SCRIPT,
        },
      },
      {
        status: "known",
        probedAt: new Date().toISOString(),
        method: `${row.provider}_scrape`,
        methodLabel: CBOE_INDICES_SYNC_SCRIPT,
        fetchUrl: row.csvUrl,
        officialUrl: row.officialUrl,
        message: `CBOE ${row.seriesKey.toUpperCase()} 历史 CSV 抓取`,
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
          agencyId: CBOE_SOURCE.agencyId,
          sourceId: CBOE_SOURCE.id,
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
        sourceId: CBOE_SOURCE.id,
        sourceSeriesKey: row.instrumentCode,
        fetchMethod: DataFetchMethod.API,
        granularity: DataGranularity.DAILY,
        releaseRule: RELEASE_RULE,
        nextRunAt,
        enabled: true,
        priority: 8,
      },
      update: {
        sourceId: CBOE_SOURCE.id,
        sourceSeriesKey: row.instrumentCode,
        granularity: DataGranularity.DAILY,
        releaseRule: RELEASE_RULE,
        enabled: true,
        ...(nextRunAt ? { nextRunAt } : {}),
      },
    });

    console.log(
      `[data:seed-cboe-vix9d-vvix] ✓ ${row.instrumentCode}（${existing ? "updated" : "created"}）`,
    );
  }

  console.log(
    "  下一步：npm run data:sync-cboe-vix9d-vvix（回填）&& npm run data:verify-cboe-vix9d-vvix -- --db",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
