/**
 * 海关总署主要商品量值表——种子（数据源 + 150 条仪器 + 订阅 + scrape metadata）
 *
 * npm run data:seed-gacc-commodity
 * Agent C 实跑（2026-09）：HTML 表格抓取（英文站表(13)/(14)），非 FRED 序列（已核实：
 * FRED 无中国分商品进出口量值；UN Comtrade 的中国月度数据 2025-01 起为空，不可用）。
 * 回填深度上限 2020-01（源站 2018–2019 用的是另一套商品名录，见 catalog 注释）。
 *
 * 落库口径：每个商品 3 条序列 = 当月数量 / 当月金额 / 当月单价。
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
import { computeNextRunAt, defaultEconomicCalendarRule } from "../../src/lib/data/scheduler/releaseRule";
import {
  GACC_COMMODITY_CATEGORY,
  GACC_COMMODITY_SOURCE_NOTE,
  GACC_COMMODITY_SYNC_SCRIPT,
  GACC_DIRECTIONS,
  GACC_MEASURES,
  GACC_SOURCE,
  gaccCode,
  gaccCommodities,
  gaccLabel,
  gaccUnit,
} from "../../src/lib/data/scheduler/gaccCommodity/catalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

async function main() {
  console.log("[data:seed-gacc-commodity] 机构 + 数据源…");
  await prisma.statisticalAgency.upsert({
    where: { id: GACC_SOURCE.agencyId },
    create: {
      id: GACC_SOURCE.agencyId,
      countryCode: "CN",
      nameZh: GACC_SOURCE.nameZh,
      nameEn: GACC_SOURCE.nameEn,
      websiteUrl: GACC_SOURCE.websiteUrl,
    },
    update: {
      countryCode: "CN",
      nameZh: GACC_SOURCE.nameZh,
      nameEn: GACC_SOURCE.nameEn,
      websiteUrl: GACC_SOURCE.websiteUrl,
    },
  });
  await prisma.dataSource.upsert({
    where: { id: GACC_SOURCE.id },
    create: {
      id: GACC_SOURCE.id,
      agencyId: GACC_SOURCE.agencyId,
      name: GACC_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: GACC_SOURCE.baseUrl,
      termsUrl: GACC_SOURCE.termsUrl,
      rateLimit: { requestsPerMinute: 20, minIntervalMs: 1_500 },
    },
    update: {
      agencyId: GACC_SOURCE.agencyId,
      name: GACC_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: GACC_SOURCE.baseUrl,
      termsUrl: GACC_SOURCE.termsUrl,
      rateLimit: { requestsPerMinute: 20, minIntervalMs: 1_500 },
    },
  });

  const releaseRule = defaultEconomicCalendarRule(DataGranularity.MONTHLY);
  const nextRunAt = computeNextRunAt(releaseRule);
  const probedAt = new Date().toISOString();
  let created = 0;
  let updated = 0;

  for (const direction of GACC_DIRECTIONS) {
    for (const commodity of gaccCommodities(direction)) {
      for (const measure of GACC_MEASURES) {
        const code = gaccCode(direction, commodity.slug, measure.key);
        const label = gaccLabel(direction, commodity.labelZh, measure.key);
        const unit = gaccUnit(commodity, measure.key);
        const existing = await prisma.instrument.findUnique({
          where: { code },
          select: { id: true, metadata: true },
        });
        const previous =
          existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
            ? (existing.metadata as Record<string, unknown>)
            : {};

        const metadata = mergeFetchAcquisition(
          {
            ...previous,
            sourceTag: "gacc-commodity-scrape",
            bootstrapOnly: false,
            source: "海关总署（统计月报主要商品量值表）",
            providerNote: "General Administration of Customs of China",
            sourceUrl: GACC_SOURCE.baseUrl,
            officialUrl: GACC_SOURCE.baseUrl,
            countryCode: "CN",
            countryNameZh: "中国",
            displayName: label,
            catalogCategory: GACC_COMMODITY_CATEGORY,
            catalogKey: `mds:${code}`,
            freqLabel: "月",
            unit,
            sourceUpdateNote: GACC_COMMODITY_SOURCE_NOTE,
            scrape: {
              provider: "gacc_commodity",
              direction,
              slug: commodity.slug,
              measure: measure.key,
              commodity: commodity.sourceName,
              url: GACC_SOURCE.baseUrl,
              script: GACC_COMMODITY_SYNC_SCRIPT,
            },
          },
          {
            status: "known",
            probedAt,
            method: "gacc_commodity_scrape",
            methodLabel: GACC_COMMODITY_SYNC_SCRIPT,
            fetchUrl: GACC_SOURCE.baseUrl,
            officialUrl: GACC_SOURCE.baseUrl,
            message:
              "海关总署英文站统计月报表(13)/(14) 静态 HTML 抓取（站点无 robots.txt，公开无需登录；回填自 2020-01）",
          },
        );

        const instrument = await prisma.instrument.upsert({
          where: { code },
          create: {
            code,
            kind: InstrumentKind.MACRO_SERIES,
            name: `中国：${label}`,
            shortName: label,
            description: "海关总署统计月报主要商品量值表",
            freqLabel: "月",
            unit,
            metadata: metadata as object,
            externalRefs: {
              catalogKey: `mds:${code}`,
              agencyId: GACC_SOURCE.agencyId,
              sourceId: GACC_SOURCE.id,
            },
          },
          update: {
            name: `中国：${label}`,
            shortName: label,
            description: "海关总署统计月报主要商品量值表",
            freqLabel: "月",
            unit,
            metadata: metadata as object,
            externalRefs: {
              catalogKey: `mds:${code}`,
              agencyId: GACC_SOURCE.agencyId,
              sourceId: GACC_SOURCE.id,
            },
          },
        });
        if (existing) updated += 1;
        else created += 1;

        await prisma.dataSubscription.upsert({
          where: { instrumentId: instrument.id },
          create: {
            instrumentId: instrument.id,
            sourceId: GACC_SOURCE.id,
            sourceSeriesKey: code,
            fetchMethod: DataFetchMethod.API,
            granularity: DataGranularity.MONTHLY,
            releaseRule: releaseRule as object,
            nextRunAt,
            enabled: true,
            priority: 43,
          },
          update: {
            sourceId: GACC_SOURCE.id,
            sourceSeriesKey: code,
            fetchMethod: DataFetchMethod.API,
            granularity: DataGranularity.MONTHLY,
            releaseRule: releaseRule as object,
            enabled: true,
            ...(nextRunAt ? { nextRunAt } : {}),
          },
        });
      }
    }
  }

  console.log(`[data:seed-gacc-commodity] ✓ 仪器 created=${created} updated=${updated}`);
  console.log(
    "  下一步：npm run data:sync-gacc-commodity（回填 2020 至今）&& npm run data:verify-gacc-commodity -- --db",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
