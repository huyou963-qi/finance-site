/**
 * 周度市场定价与真实经济确认层 — FRED 种子与既有订阅修复
 *
 * npm run data:seed-market-pricing
 */
import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import {
  MARKET_PRICING_FRED_SERIES,
  MARKET_PRICING_REPAIR_SERIES,
  buildMarketPricingInstrumentMetadata,
  releaseRuleForMarketPricing,
} from "../../src/lib/data/scheduler/marketPricingFredSeedCatalog";
import { P0_DATA_SOURCE_FRED } from "../../src/lib/data/scheduler/p0SeedCatalog";
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

async function main() {
  console.log("[data:seed-market-pricing] 确保复用 FRED 数据源…");
  await prisma.dataSource.upsert({
    where: { id: P0_DATA_SOURCE_FRED.id },
    create: {
      id: P0_DATA_SOURCE_FRED.id,
      agencyId: P0_DATA_SOURCE_FRED.agencyId,
      name: P0_DATA_SOURCE_FRED.name,
      adapterKind: SourceAdapterKind.FRED_API,
      baseUrl: P0_DATA_SOURCE_FRED.baseUrl,
      termsUrl: P0_DATA_SOURCE_FRED.termsUrl,
      rateLimit: P0_DATA_SOURCE_FRED.rateLimit,
    },
    update: {},
  });

  let created = 0;
  let updated = 0;
  for (const item of MARKET_PRICING_FRED_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: item.code } });
    if (existing) updated += 1;
    else created += 1;

    const latestObs = existing
      ? await prisma.macroObservation.findFirst({
          where: { instrumentId: existing.id },
          orderBy: { obsDate: "desc" },
          select: { obsDate: true },
        })
      : null;
    const existingMetadata =
      existing?.metadata &&
      typeof existing.metadata === "object" &&
      !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : null;
    const metadata = buildMarketPricingInstrumentMetadata(item, {
      existing: existingMetadata,
      dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10) ?? null,
    });

    const instrument = await prisma.instrument.upsert({
      where: { code: item.code },
      create: {
        code: item.code,
        kind: InstrumentKind.MACRO_SERIES,
        name: item.name,
        freqLabel: item.freqLabel,
        unit: item.unit,
        fredSeriesId: item.fredId,
        metadata,
        externalRefs: {
          catalogKey: `fred:${item.fredId}`,
          agencyId: "us-fred",
          sourceId: "fred",
          marketPricingCategory: item.category,
        },
      },
      update: {
        name: item.name,
        freqLabel: item.freqLabel,
        unit: item.unit,
        fredSeriesId: item.fredId,
        metadata,
      },
    });

    const rule = releaseRuleForMarketPricing(item.granularity);
    const nextRunAt = computeNextRunAt(rule, new Date());
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        sourceId: "fred",
        sourceSeriesKey: item.fredId,
        fetchMethod: DataFetchMethod.API,
        granularity: item.granularity,
        releaseRule: rule,
        nextRunAt,
        enabled: true,
        priority: 10,
      },
      update: {
        sourceId: "fred",
        sourceSeriesKey: item.fredId,
        fetchMethod: DataFetchMethod.API,
        granularity: item.granularity,
        releaseRule: rule,
        nextRunAt,
        enabled: true,
        priority: 10,
        retryCount: 0,
        lastError: null,
      },
    });
    console.log(`  ✓ ${item.code} (${item.fredId})`);
  }

  console.log("[data:seed-market-pricing] 修复既有订阅调度（不重复创建 Instrument）…");
  let repaired = 0;
  for (const item of MARKET_PRICING_REPAIR_SERIES) {
    const instrument = await prisma.instrument.findUnique({ where: { code: item.code } });
    if (!instrument) {
      throw new Error(`缺复用序列 ${item.code}；请先运行其原 catalog seed`);
    }
    const rule = item.releaseRule();
    const nextRunAt = computeNextRunAt(rule, new Date());
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        sourceId: "fred",
        sourceSeriesKey: item.fredId,
        fetchMethod: DataFetchMethod.API,
        granularity: item.granularity,
        releaseRule: rule,
        nextRunAt,
        enabled: true,
        priority: 10,
      },
      update: {
        sourceId: "fred",
        sourceSeriesKey: item.fredId,
        fetchMethod: DataFetchMethod.API,
        granularity: item.granularity,
        releaseRule: rule,
        nextRunAt,
        enabled: true,
        priority: 10,
        retryCount: 0,
        lastError: null,
      },
    });
    repaired += 1;
    console.log(`  ✓ ${item.code} → ${rule.type}`);
  }

  console.log(
    `[data:seed-market-pricing] 完成 created=${created} updated=${updated} repaired=${repaired}`,
  );
  console.log("  下一步：data:seed-release-packages → sync-one 全量回填 → verify");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
