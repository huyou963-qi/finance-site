/**
 * 黄金现货（WGC LBMA 金价）/ COMEX 黄金期货（Yahoo GC=F）/ NYMEX WTI 原油期货（Yahoo CL=F）标准序列——种子
 *
 * npm run data:seed -- --catalog=gold-prices
 * npm run data:seed-gold-prices -- --dry-run
 *
 * 建数据源 + 仪器 + 订阅；仪器**无观测时当场全量回填**（WGC 1970 起按 ≤300 天分段、GC=F 2000 起），
 * 因为部署末尾的 verify-retired-indicators 要求模板替代键已有观测，不能等 worker 下一轮。
 * 已有观测时只更新定义，增量交给调度器。
 * 同时停用被取代旧列（goldov_c01 / goldov_c02 / usov_c05）的订阅；它们的模板替换与目录隐藏
 * 由 seed-retired-indicators 完成，历史观测保留。
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { DataFetchMethod, DataGranularity, InstrumentKind, PrismaClient, SourceAdapterKind } from "@prisma/client";
import { fetchWgcGoldPriceIncremental } from "../../src/lib/data/scheduler/adapters/wgcGoldPriceAdapter";
import { fetchYahooChartIncremental } from "../../src/lib/data/scheduler/adapters/yahooChartAdapter";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import {
  GOLD_PRICE_INSTRUMENTS,
  GOLD_SUPERSEDED_BY,
  type GoldPriceInstrumentDef,
} from "../../src/lib/data/scheduler/goldPrices/catalog";
import { OIL_PRICE_INSTRUMENTS } from "../../src/lib/data/scheduler/oilPrices/catalog";
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";
import { usMetadataCatalogCategory } from "../../src/lib/data/usCatalogTaxonomy";
import { WGC_GOLD_PRICE_SOURCE } from "../../src/lib/data/scheduler/wgcGoldPrice/catalog";
import { YAHOO_CHART_SOURCE } from "../../src/lib/data/scheduler/yahooGold/catalog";

const prisma = new PrismaClient();

const INSTRUMENTS: readonly GoldPriceInstrumentDef[] = [...GOLD_PRICE_INSTRUMENTS, ...OIL_PRICE_INSTRUMENTS];
const OIL_CODES = new Set(OIL_PRICE_INSTRUMENTS.map((row) => row.code));

async function ensureSources() {
  await prisma.statisticalAgency.upsert({
    where: { id: WGC_GOLD_PRICE_SOURCE.agencyId },
    create: {
      id: WGC_GOLD_PRICE_SOURCE.agencyId,
      countryCode: "IM",
      nameZh: "世界黄金协会",
      nameEn: "World Gold Council",
      websiteUrl: "https://www.gold.org/",
    },
    update: {},
  });
  const wgc = {
    agencyId: WGC_GOLD_PRICE_SOURCE.agencyId,
    name: WGC_GOLD_PRICE_SOURCE.name,
    baseUrl: WGC_GOLD_PRICE_SOURCE.baseUrl,
    termsUrl: WGC_GOLD_PRICE_SOURCE.termsUrl,
  };
  await prisma.dataSource.upsert({
    where: { id: WGC_GOLD_PRICE_SOURCE.id },
    create: {
      id: WGC_GOLD_PRICE_SOURCE.id,
      ...wgc,
      adapterKind: SourceAdapterKind.REST_API,
      rateLimit: { requestsPerMinute: 20, minIntervalMs: 3000 },
    },
    update: wgc,
  });

  await prisma.statisticalAgency.upsert({
    where: { id: YAHOO_CHART_SOURCE.agencyId },
    create: {
      id: YAHOO_CHART_SOURCE.agencyId,
      countryCode: "US",
      nameZh: YAHOO_CHART_SOURCE.nameZh,
      nameEn: YAHOO_CHART_SOURCE.nameEn,
      websiteUrl: YAHOO_CHART_SOURCE.websiteUrl,
    },
    update: {},
  });
  const yahoo = {
    agencyId: YAHOO_CHART_SOURCE.agencyId,
    name: YAHOO_CHART_SOURCE.name,
    baseUrl: YAHOO_CHART_SOURCE.baseUrl,
    termsUrl: YAHOO_CHART_SOURCE.termsUrl,
  };
  await prisma.dataSource.upsert({
    where: { id: YAHOO_CHART_SOURCE.id },
    create: {
      id: YAHOO_CHART_SOURCE.id,
      ...yahoo,
      adapterKind: SourceAdapterKind.REST_API,
      rateLimit: { requestsPerMinute: 30, minIntervalMs: 2000 },
    },
    update: yahoo,
  });
}

function buildMetadata(row: GoldPriceInstrumentDef, prev: Record<string, unknown>) {
  return mergeFetchAcquisition(
    {
      ...prev,
      sourceTag: OIL_CODES.has(row.code) ? "oil-prices" : "gold-prices",
      bootstrapOnly: false,
      source: row.source.name,
      providerNote: row.description,
      sourceUrl: row.source.officialUrl,
      officialUrl: row.source.officialUrl,
      countryCode: "US",
      countryNameZh: "美国",
      displayName: row.shortName,
      catalogCategory: usMetadataCatalogCategory({ code: row.code }),
      freqLabel: row.freqLabel,
      unit: row.unit,
      sourceUpdateNote: `${row.acquisitionLabel}，日频，每 ${row.releaseRule.intervalHours} 小时探测`,
      scrape: row.scrape,
    },
    {
      status: "known",
      probedAt: new Date().toISOString(),
      method: row.acquisitionMethod,
      methodLabel: row.acquisitionLabel,
      fetchUrl: row.source.url,
      officialUrl: row.source.officialUrl,
      message: row.description,
    },
  );
}

async function fetchFullHistory(row: GoldPriceInstrumentDef, metadata: unknown) {
  const start = "1950-01-01";
  const result =
    row.scrape.provider === "wgc_gold_price"
      ? await fetchWgcGoldPriceIncremental(metadata, start)
      : await fetchYahooChartIncremental(metadata, row.code, start);
  return result.points;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`[data:seed-gold-prices] 数据源${dryRun ? "（dry-run）" : ""}…`);
  if (!dryRun) await ensureSources();

  for (const row of INSTRUMENTS) {
    const existing = await prisma.instrument.findUnique({ where: { code: row.code } });
    const prev =
      existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {};
    const metadata = buildMetadata(row, prev);
    const obsCount = existing ? await prisma.macroObservation.count({ where: { instrumentId: existing.id } }) : 0;

    let backfill: Awaited<ReturnType<typeof fetchFullHistory>> = [];
    if (obsCount === 0) {
      backfill = await fetchFullHistory(row, metadata);
      if (backfill.length === 0) throw new Error(`${row.code}：全量回填未取到数据，拒绝建空仪器`);
      const first = backfill[0]!.obsDate.toISOString().slice(0, 10);
      const last = backfill[backfill.length - 1]!.obsDate.toISOString().slice(0, 10);
      console.log(`  ↓ ${row.code}：全量回填 ${backfill.length} 条（${first} → ${last}）`);
    }
    if (dryRun) {
      console.log(`  ~ ${row.code}（${existing ? `已存在，${obsCount} 条观测` : "将新建"}）`);
      continue;
    }

    const instrument = await prisma.instrument.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        kind: InstrumentKind.MACRO_SERIES,
        name: row.name,
        nameEn: row.nameEn,
        shortName: row.shortName,
        description: row.description,
        freqLabel: row.freqLabel,
        unit: row.unit,
        metadata: metadata as object,
        externalRefs: { catalogKey: `mds:${row.code}`, sourceId: row.source.id },
      },
      update: {
        name: row.name,
        nameEn: row.nameEn,
        shortName: row.shortName,
        description: row.description,
        freqLabel: row.freqLabel,
        unit: row.unit,
        metadata: metadata as object,
      },
    });
    if (backfill.length > 0) {
      await prisma.macroObservation.createMany({
        data: backfill.map((p) => ({ instrumentId: instrument.id, obsDate: p.obsDate, value: p.value })),
        skipDuplicates: true,
      });
    }

    const latest = await prisma.macroObservation.findFirst({
      where: { instrumentId: instrument.id },
      orderBy: { obsDate: "desc" },
      select: { obsDate: true },
    });
    const nextRunAt = computeNextRunAt(row.releaseRule, new Date());
    const common = {
      sourceId: row.source.id,
      sourceSeriesKey: row.source.seriesKey,
      fetchMethod: DataFetchMethod.API,
      granularity: DataGranularity.DAILY,
      releaseRule: row.releaseRule,
      enabled: true,
      priority: 7,
    };
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: { instrumentId: instrument.id, ...common, nextRunAt, lastObsDate: latest?.obsDate ?? null },
      update: {
        ...common,
        ...(backfill.length > 0 ? { lastObsDate: latest?.obsDate ?? null, nextRunAt, retryCount: 0, lastError: null } : {}),
      },
    });
    console.log(
      `  ✓ ${row.code} ← ${row.source.id}:${row.source.seriesKey}（${existing ? "更新" : "新建"}，` +
        `最新 ${latest?.obsDate.toISOString().slice(0, 10) ?? "无"}）`,
    );
  }

  // 被取代旧列：停用订阅（调度器也会因 tombstone 跳过；停用让管理端状态一致）
  for (const [code, target] of Object.entries(GOLD_SUPERSEDED_BY)) {
    const inst = await prisma.instrument.findUnique({ where: { code }, include: { dataSubscription: true } });
    if (!inst?.dataSubscription?.enabled) continue;
    if (!dryRun) {
      await prisma.dataSubscription.update({ where: { id: inst.dataSubscription.id }, data: { enabled: false } });
    }
    console.log(`  ⊘ ${code} 订阅停用（被 ${target} 取代，历史保留）`);
  }
  console.log("[data:seed-gold-prices] 完成");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
