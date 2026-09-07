/**
 * 国家金融监督管理总局银行业监管统计——种子（机构 + 数据源 + 仪器 + 订阅）。
 *
 * npm run data:seed-nfra-banking
 * Agent C / C3：官网静态目录 JSON + 官方 Excel；无固定发布日历，低频探测。
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

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
  NFRA_BANKING_SERIES,
  NFRA_BANKING_SOURCE,
  NFRA_BANKING_STATS_PAGE_URL,
  NFRA_BANKING_SYNC_SCRIPT,
} from "../../src/lib/data/scheduler/nfraBanking/catalog";

const prisma = new PrismaClient();
const PROBE_RULE = { type: "probe_interval" as const, intervalHours: 24 };

async function main() {
  await prisma.statisticalAgency.upsert({
    where: { id: NFRA_BANKING_SOURCE.agencyId },
    create: {
      id: NFRA_BANKING_SOURCE.agencyId,
      countryCode: "CN",
      nameZh: NFRA_BANKING_SOURCE.nameZh,
      nameEn: NFRA_BANKING_SOURCE.nameEn,
      websiteUrl: NFRA_BANKING_SOURCE.websiteUrl,
    },
    update: {
      nameZh: NFRA_BANKING_SOURCE.nameZh,
      nameEn: NFRA_BANKING_SOURCE.nameEn,
      websiteUrl: NFRA_BANKING_SOURCE.websiteUrl,
    },
  });
  await prisma.dataSource.upsert({
    where: { id: NFRA_BANKING_SOURCE.id },
    create: {
      id: NFRA_BANKING_SOURCE.id,
      agencyId: NFRA_BANKING_SOURCE.agencyId,
      name: NFRA_BANKING_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: NFRA_BANKING_SOURCE.baseUrl,
      rateLimit: { requestsPerMinute: 12, minIntervalMs: 300 },
      metadata: {
        sourceAttribution: "文章来源：国家金融监督管理总局网站",
        discovery: "官网统计信息栏目静态 JSON；详情 JSON 的 attachmentInfoVOList 指向 Excel",
      },
    },
    update: {
      agencyId: NFRA_BANKING_SOURCE.agencyId,
      name: NFRA_BANKING_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: NFRA_BANKING_SOURCE.baseUrl,
      rateLimit: { requestsPerMinute: 12, minIntervalMs: 300 },
    },
  });

  for (const row of NFRA_BANKING_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: row.instrumentCode } });
    const previous =
      existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {};
    const metadata = mergeFetchAcquisition(
      {
        ...previous,
        sourceTag: "nfra-banking-official-excel",
        bootstrapOnly: false,
        source: "NFRA",
        providerNote: NFRA_BANKING_SOURCE.name,
        sourceUrl: NFRA_BANKING_STATS_PAGE_URL,
        officialUrl: NFRA_BANKING_STATS_PAGE_URL,
        sourceAttribution: "文章来源：国家金融监督管理总局网站",
        countryCode: "CN",
        countryNameZh: "中国",
        displayName: row.displayName,
        catalogCategory: row.category,
        freqLabel: row.freqLabel,
        unit: row.unit,
        definitionNote: row.definitionNote,
        definitionHistory: row.comparabilityBreaks,
        sourceUpdateNote:
          row.dataset === "bank_assets_monthly"
            ? "月度表通常于次月下旬更新；观测日归一为月初。"
            : "季度表通常于季末后约45天更新；观测日归一为季度首日；净利润为本年累计。",
        scrape: {
          provider: row.provider,
          dataset: row.dataset,
          indexUrl: NFRA_BANKING_STATS_PAGE_URL,
          script: NFRA_BANKING_SYNC_SCRIPT,
        },
      },
      {
        status: "known",
        probedAt: new Date().toISOString(),
        method: "nfra_official_excel",
        methodLabel: NFRA_BANKING_SYNC_SCRIPT,
        fetchUrl: NFRA_BANKING_STATS_PAGE_URL,
        officialUrl: NFRA_BANKING_STATS_PAGE_URL,
        message: "金融监管总局统计信息栏目静态 JSON 发现文档，下载官方 xls/xlsx 并按声明行列解析",
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
          agencyId: NFRA_BANKING_SOURCE.agencyId,
          sourceId: NFRA_BANKING_SOURCE.id,
        },
      },
      update: {
        name: row.name,
        freqLabel: row.freqLabel,
        unit: row.unit,
        metadata: metadata as object,
      },
    });

    const nextRunAt = computeNextRunAt(PROBE_RULE, new Date());
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        sourceId: NFRA_BANKING_SOURCE.id,
        sourceSeriesKey: row.seriesKey,
        fetchMethod: DataFetchMethod.API,
        granularity:
          row.granularity === "MONTHLY" ? DataGranularity.MONTHLY : DataGranularity.QUARTERLY,
        releaseRule: PROBE_RULE,
        revisionLookback: row.dataset === "bank_assets_monthly" ? 15 : 30,
        nextRunAt,
        enabled: true,
        priority: 12,
      },
      update: {
        sourceId: NFRA_BANKING_SOURCE.id,
        sourceSeriesKey: row.seriesKey,
        fetchMethod: DataFetchMethod.API,
        granularity:
          row.granularity === "MONTHLY" ? DataGranularity.MONTHLY : DataGranularity.QUARTERLY,
        releaseRule: PROBE_RULE,
        revisionLookback: row.dataset === "bank_assets_monthly" ? 15 : 30,
        enabled: true,
        ...(nextRunAt ? { nextRunAt } : {}),
      },
    });
  }
  console.log(`[data:seed-nfra-banking] 完成：${NFRA_BANKING_SERIES.length} 条仪器与订阅`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
