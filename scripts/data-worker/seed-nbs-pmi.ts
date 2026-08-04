/**
 * 国家统计局中国 PMI：数据源、24 条仪器、订阅与获取方式 metadata。
 *
 * npm run data:seed-nbs-pmi
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
import {
  NBS_PMI_INDEX_URL,
  NBS_PMI_HISTORY_API_URL,
  NBS_PMI_INSTRUMENTS,
  NBS_PMI_SOURCE,
  NBS_PMI_SYNC_SCRIPT,
} from "../../src/lib/data/scheduler/nbsPmi/catalog";
import {
  computeNextRunAt,
  defaultEconomicCalendarRule,
} from "../../src/lib/data/scheduler/releaseRule";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  await prisma.statisticalAgency.upsert({
    where: { id: NBS_PMI_SOURCE.agencyId },
    create: {
      id: NBS_PMI_SOURCE.agencyId,
      countryCode: "CN",
      nameZh: "国家统计局",
      nameEn: "National Bureau of Statistics of China",
      websiteUrl: "https://www.stats.gov.cn/",
    },
    update: {
      countryCode: "CN",
      nameZh: "国家统计局",
      nameEn: "National Bureau of Statistics of China",
      websiteUrl: "https://www.stats.gov.cn/",
    },
  });
  await prisma.dataSource.upsert({
    where: { id: NBS_PMI_SOURCE.id },
    create: {
      id: NBS_PMI_SOURCE.id,
      agencyId: NBS_PMI_SOURCE.agencyId,
      name: NBS_PMI_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: NBS_PMI_SOURCE.baseUrl,
      termsUrl: NBS_PMI_SOURCE.termsUrl,
      rateLimit: { requestsPerMinute: 6, minIntervalMs: 1000 },
    },
    update: {
      agencyId: NBS_PMI_SOURCE.agencyId,
      name: NBS_PMI_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: NBS_PMI_SOURCE.baseUrl,
      termsUrl: NBS_PMI_SOURCE.termsUrl,
      rateLimit: { requestsPerMinute: 6, minIntervalMs: 1000 },
    },
  });

  const releaseRule = defaultEconomicCalendarRule(DataGranularity.MONTHLY);
  const nextRunAt = computeNextRunAt(releaseRule, new Date());
  const probedAt = new Date().toISOString();

  for (const definition of NBS_PMI_INSTRUMENTS) {
    const existing = await prisma.instrument.findUnique({
      where: { code: definition.code },
    });
    const latestObs = existing
      ? await prisma.macroObservation.findFirst({
          where: { instrumentId: existing.id },
          orderBy: { obsDate: "desc" },
          select: { obsDate: true },
        })
      : null;
    const previousMetadata =
      existing?.metadata &&
      typeof existing.metadata === "object" &&
      !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {};
    const metadata = mergeFetchAcquisition(
      {
        ...previousMetadata,
        sourceTag: "nbs-pmi-official-xls",
        bootstrapOnly: false,
        source: "国家统计局",
        providerNote: "National Bureau of Statistics of China",
        sourceUrl: NBS_PMI_INDEX_URL,
        officialUrl: NBS_PMI_INDEX_URL,
        countryCode: "CN",
        countryNameZh: "中国",
        displayName: definition.displayName,
        catalogCategory: "景气调查",
        freqLabel: "月",
        unit: "%",
        sourceUpdateNote: "国家统计局每月 PMI 发布包（官方 Excel，内含连续 13 个月）",
        dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10),
        scrape: {
          provider: "nbs_pmi",
          indexUrl: NBS_PMI_INDEX_URL,
          historyApiUrl: NBS_PMI_HISTORY_API_URL,
          component: definition.component,
          sheet: definition.sheetName,
          sourceLabel: definition.sourceLabel,
          script: NBS_PMI_SYNC_SCRIPT,
        },
      },
      {
        status: "known",
        probedAt,
        method: "nbs_pmi_official_xls",
        methodLabel: NBS_PMI_SYNC_SCRIPT,
        fetchUrl: NBS_PMI_INDEX_URL,
        officialUrl: NBS_PMI_INDEX_URL,
        message: "国家统计局月报 Excel 首发 + 新版国家数据 UUID/JSON 全历史",
      },
    );

    const instrument = await prisma.instrument.upsert({
      where: { code: definition.code },
      create: {
        code: definition.code,
        kind: InstrumentKind.MACRO_SERIES,
        name: `中国：${definition.displayName}`,
        shortName: definition.displayName,
        description: "国家统计局采购经理指数（经季节调整）",
        freqLabel: "月",
        unit: "%",
        metadata: metadata as object,
        externalRefs: {
          catalogKey: `mds:${definition.code}`,
          agencyId: NBS_PMI_SOURCE.agencyId,
          sourceId: NBS_PMI_SOURCE.id,
        },
      },
      update: {
        shortName: definition.displayName,
        description: "国家统计局采购经理指数（经季节调整）",
        freqLabel: "月",
        unit: "%",
        metadata: metadata as object,
      },
    });
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        sourceId: NBS_PMI_SOURCE.id,
        sourceSeriesKey: definition.component,
        fetchMethod: DataFetchMethod.API,
        granularity: DataGranularity.MONTHLY,
        releaseRule: releaseRule as object,
        nextRunAt,
        enabled: true,
        priority: 40,
      },
      update: {
        sourceId: NBS_PMI_SOURCE.id,
        sourceSeriesKey: definition.component,
        fetchMethod: DataFetchMethod.API,
        granularity: DataGranularity.MONTHLY,
        releaseRule: releaseRule as object,
        nextRunAt,
        enabled: true,
        priority: 40,
      },
    });
    console.log(`  ✓ ${definition.code} ← ${definition.sheetName}/${definition.sourceLabel}`);
  }

  console.log(`[data:seed-nbs-pmi] 完成：${NBS_PMI_INSTRUMENTS.length} 条订阅`);
  console.log("  下一步：npm run data:sync-nbs-pmi && npm run data:sync-calendar");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
