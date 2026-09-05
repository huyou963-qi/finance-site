/**
 * AAR 美国铁路周度装车量/多式联运量抓取——种子（数据源 + 仪器 + 订阅 + scrape metadata）
 *
 * npm run data:seed-aar-rail-traffic
 * Agent C 实跑（2026-09）：HTML 新闻稿正文抓取，非 FRED 序列（FRED 的
 * RAILFRTCARLOADS/RAILFRTINTERMODAL 是 BTS 按周汇总数据折算的月频衍生序列，滞后约
 * 2 个月，口径与更新时效均不同于 AAR 官方周度新闻稿，故仍属有效抓取目标——已核实）。
 * 回填深度上限 2019-01-01（正文句式核实置信度限制，非页面限制）。
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
  AAR_RAIL_TRAFFIC_SERIES,
  AAR_RAIL_TRAFFIC_SYNC_SCRIPT,
  AAR_SOURCE,
} from "../../src/lib/data/scheduler/aarRailTraffic/catalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

/** 周频，官方每周三中午发布，无 TE 日历事件 → 定期探测 */
const RELEASE_RULE = { type: "probe_interval" as const, intervalHours: 72 };

async function main() {
  console.log("[data:seed-aar-rail-traffic] 机构 + 数据源…");
  await prisma.statisticalAgency.upsert({
    where: { id: AAR_SOURCE.agencyId },
    create: {
      id: AAR_SOURCE.agencyId,
      countryCode: "US",
      nameZh: AAR_SOURCE.nameZh,
      nameEn: AAR_SOURCE.nameEn,
      websiteUrl: AAR_SOURCE.websiteUrl,
    },
    update: { nameZh: AAR_SOURCE.nameZh, nameEn: AAR_SOURCE.nameEn, websiteUrl: AAR_SOURCE.websiteUrl },
  });
  await prisma.dataSource.upsert({
    where: { id: AAR_SOURCE.id },
    create: {
      id: AAR_SOURCE.id,
      agencyId: AAR_SOURCE.agencyId,
      name: AAR_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: AAR_SOURCE.baseUrl,
      termsUrl: AAR_SOURCE.termsUrl,
      rateLimit: { requestsPerMinute: 6, minIntervalMs: 5000 },
    },
    update: {
      agencyId: AAR_SOURCE.agencyId,
      name: AAR_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: AAR_SOURCE.baseUrl,
      termsUrl: AAR_SOURCE.termsUrl,
    },
  });

  for (const row of AAR_RAIL_TRAFFIC_SERIES) {
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
        sourceTag: "aar-rail-traffic-scrape",
        bootstrapOnly: false,
        source: "AAR",
        providerNote: "Association of American Railroads",
        sourceUrl: row.officialUrl,
        officialUrl: row.officialUrl,
        countryCode: row.countryCode,
        countryNameZh: "美国",
        displayName: row.displayName,
        catalogCategory: row.category,
        freqLabel: row.freqLabel,
        unit: row.unit,
        sourceUpdateNote: "AAR 官方每周三中午发布 Weekly Railroad Traffic 新闻稿",
        dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10) ?? undefined,
        scrape: {
          provider: row.provider,
          url: row.officialUrl,
          series: row.seriesKey,
          script: AAR_RAIL_TRAFFIC_SYNC_SCRIPT,
        },
      },
      {
        status: "known",
        probedAt: new Date().toISOString(),
        method: `${row.provider}_scrape`,
        methodLabel: AAR_RAIL_TRAFFIC_SYNC_SCRIPT,
        fetchUrl: row.officialUrl,
        officialUrl: row.officialUrl,
        message: `AAR 周度新闻稿正文抓取（${row.seriesKey}，回填深度上限 2019-01-01）`,
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
          agencyId: AAR_SOURCE.agencyId,
          sourceId: AAR_SOURCE.id,
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
        sourceId: AAR_SOURCE.id,
        sourceSeriesKey: row.instrumentCode,
        fetchMethod: DataFetchMethod.API,
        granularity: DataGranularity.WEEKLY,
        releaseRule: RELEASE_RULE,
        nextRunAt,
        enabled: true,
        priority: 8,
      },
      update: {
        sourceId: AAR_SOURCE.id,
        sourceSeriesKey: row.instrumentCode,
        granularity: DataGranularity.WEEKLY,
        releaseRule: RELEASE_RULE,
        enabled: true,
        ...(nextRunAt ? { nextRunAt } : {}),
      },
    });

    console.log(
      `[data:seed-aar-rail-traffic] ✓ ${row.instrumentCode}（${existing ? "updated" : "created"}）`,
    );
  }

  console.log(
    "  下一步：npm run data:sync-aar-rail-traffic（回填）&& npm run data:verify-aar-rail-traffic -- --db",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
