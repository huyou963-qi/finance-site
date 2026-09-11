/**
 * 黄金收盘价改由行情接口（Yahoo GC=F）更新——种子（数据源 + 订阅 + scrape metadata）
 *
 * npm run data:seed -- --catalog=yahoo-gold-prices
 * 仅改获取方式：仪器与 xlsx 历史保留，订阅 lastObsDate 取库内最新观测，worker 只往后续接。
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { DataFetchMethod, DataGranularity, PrismaClient, SourceAdapterKind } from "@prisma/client";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";
import {
  YAHOO_CHART_SOURCE,
  YAHOO_GOLD_RELEASE_RULE,
  YAHOO_GOLD_SERIES,
} from "../../src/lib/data/scheduler/yahooGold/catalog";

const prisma = new PrismaClient();

async function ensureSource() {
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
  await prisma.dataSource.upsert({
    where: { id: YAHOO_CHART_SOURCE.id },
    create: {
      id: YAHOO_CHART_SOURCE.id,
      agencyId: YAHOO_CHART_SOURCE.agencyId,
      name: YAHOO_CHART_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: YAHOO_CHART_SOURCE.baseUrl,
      termsUrl: YAHOO_CHART_SOURCE.termsUrl,
      rateLimit: { requestsPerMinute: 30, minIntervalMs: 2000 },
    },
    update: {
      agencyId: YAHOO_CHART_SOURCE.agencyId,
      name: YAHOO_CHART_SOURCE.name,
      baseUrl: YAHOO_CHART_SOURCE.baseUrl,
      termsUrl: YAHOO_CHART_SOURCE.termsUrl,
    },
  });
}

async function main() {
  console.log("[data:seed-yahoo-gold-prices] 数据源 yahoo-chart…");
  await ensureSource();

  for (const row of YAHOO_GOLD_SERIES) {
    const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
    if (!inst) {
      console.log(`  · 跳过 ${row.code}（仪器未入库，需先导入对应 xlsx）`);
      continue;
    }
    const latest = await prisma.macroObservation.findFirst({
      where: { instrumentId: inst.id },
      orderBy: { obsDate: "desc" },
      select: { obsDate: true },
    });
    const prevMd =
      inst.metadata && typeof inst.metadata === "object" && !Array.isArray(inst.metadata)
        ? (inst.metadata as Record<string, unknown>)
        : {};
    const url = `${YAHOO_CHART_SOURCE.baseUrl}/${encodeURIComponent(row.symbol)}`;
    const metadata = mergeFetchAcquisition(
      {
        ...prevMd,
        bootstrapOnly: false,
        source: row.source,
        providerNote: row.note,
        sourceUrl: url,
        sourceUpdateNote: `行情接口 Yahoo ${row.symbol} 日线收盘价，每日探测`,
        // continueAfter：只续接 xlsx 历史之后的行情，不回写历史
        scrape: { provider: "yahoo_chart", symbol: row.symbol, url, continueAfter: row.continueAfter },
      },
      {
        status: "known",
        probedAt: new Date().toISOString(),
        method: "yahoo_chart",
        methodLabel: `行情接口 Yahoo ${row.symbol}`,
        fetchUrl: url,
        message: row.note,
      },
    );
    await prisma.instrument.update({ where: { id: inst.id }, data: { metadata: metadata as object } });

    const nextRunAt = computeNextRunAt(YAHOO_GOLD_RELEASE_RULE, new Date());
    const common = {
      sourceId: YAHOO_CHART_SOURCE.id,
      sourceSeriesKey: row.symbol,
      fetchMethod: DataFetchMethod.API,
      granularity: DataGranularity.DAILY,
      releaseRule: YAHOO_GOLD_RELEASE_RULE,
      enabled: true,
      priority: 7,
      retryCount: 0,
      lastError: null,
    };
    const existing = await prisma.dataSubscription.findUnique({ where: { instrumentId: inst.id } });
    // 旧订阅指向别的源（如已下架的 FRED 金价）时，把 lastObsDate 重置为库内最新观测，避免续接断档
    const switching = existing && existing.sourceId !== YAHOO_CHART_SOURCE.id;
    await prisma.dataSubscription.upsert({
      where: { instrumentId: inst.id },
      create: { instrumentId: inst.id, ...common, nextRunAt, lastObsDate: latest?.obsDate ?? null },
      update: {
        ...common,
        ...(switching ? { lastObsDate: latest?.obsDate ?? null, nextRunAt } : {}),
      },
    });
    console.log(
      `  ✓ ${row.code} ← yahoo-chart:${row.symbol}（库内最新 ${latest?.obsDate.toISOString().slice(0, 10) ?? "无"}${switching ? `，由 ${existing.sourceId} 切换` : ""}）`,
    );
  }
  console.log("[data:seed-yahoo-gold-prices] 完成；立即续接：npm run data:sync-one -- <code>");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
