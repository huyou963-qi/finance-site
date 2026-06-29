/**
 * CFTC Managed Money COT 种子 + 历史回填
 *
 * npm run data:seed-cot
 * npm run data:seed-cot -- --skip-bulk
 * npm run data:sync-cot
 */
import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  DataGranularity,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import {
  COT_MM_PRODUCTS,
  cotInstrumentCode,
  type CotMetric,
} from "../../src/lib/data/cot/cotProductCatalog";
import { bulkImportCotHistory } from "../../src/lib/data/scheduler/cftcCot/bulkImport";
import {
  CFTC_COT_SOURCE,
  buildCotInstrumentMetadata,
  cotInstrumentName,
} from "../../src/lib/data/scheduler/cotSeedCatalog";
import { clearFredCatalogCache } from "../../src/lib/data/fredCatalog";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import {
  computeNextRunAt,
  defaultReleaseRuleForGranularity,
} from "../../src/lib/data/scheduler/releaseRule";
import { runDataSubscription, type SubscriptionWithRelations } from "../../src/lib/data/scheduler/runSubscription";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

async function ensureAgencyAndSource() {
  await prisma.statisticalAgency.upsert({
    where: { id: CFTC_COT_SOURCE.agencyId },
    create: {
      id: CFTC_COT_SOURCE.agencyId,
      countryCode: "US",
      nameZh: "美国商品期货交易委员会",
      nameEn: "U.S. Commodity Futures Trading Commission",
      websiteUrl: "https://www.cftc.gov/",
    },
    update: {
      countryCode: "US",
      nameZh: "美国商品期货交易委员会",
      nameEn: "U.S. Commodity Futures Trading Commission",
      websiteUrl: "https://www.cftc.gov/",
    },
  });

  await prisma.dataSource.upsert({
    where: { id: CFTC_COT_SOURCE.id },
    create: {
      id: CFTC_COT_SOURCE.id,
      agencyId: CFTC_COT_SOURCE.agencyId,
      name: CFTC_COT_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: CFTC_COT_SOURCE.baseUrl,
      termsUrl: CFTC_COT_SOURCE.termsUrl,
      rateLimit: CFTC_COT_SOURCE.rateLimit,
    },
    update: {
      agencyId: CFTC_COT_SOURCE.agencyId,
      name: CFTC_COT_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: CFTC_COT_SOURCE.baseUrl,
      termsUrl: CFTC_COT_SOURCE.termsUrl,
      rateLimit: CFTC_COT_SOURCE.rateLimit,
    },
  });
}

async function seedInstruments() {
  const releaseRule = defaultReleaseRuleForGranularity(DataGranularity.WEEKLY);
  const nextRunAt = computeNextRunAt(releaseRule, new Date());
  const probedAt = new Date().toISOString();
  let created = 0;
  let updated = 0;

  for (const product of COT_MM_PRODUCTS) {
    for (const metric of ["long", "short"] as CotMetric[]) {
      const code = cotInstrumentCode(product.slug, metric);
      const existing = await prisma.instrument.findUnique({ where: { code } });
      if (existing) updated++;
      else created++;

      const acquisition = {
        status: "known" as const,
        probedAt,
        method: "cftc_socrata_api",
        methodLabel: "CFTC Socrata API (Disaggregated Combined)",
        officialUrl: CFTC_COT_SOURCE.termsUrl,
        fetchUrl: CFTC_COT_SOURCE.baseUrl,
        message: `Managed Money ${metric} · ${product.label}`,
      };

      const metadata = buildCotInstrumentMetadata(product, metric, acquisition);

      const inst = await prisma.instrument.upsert({
        where: { code },
        create: {
          code,
          name: cotInstrumentName(product, metric),
          kind: InstrumentKind.MACRO_SERIES,
          freqLabel: "周",
          unit: "张",
          metadata: metadata as object,
        },
        update: {
          name: cotInstrumentName(product, metric),
          freqLabel: "周",
          unit: "张",
          metadata: mergeFetchAcquisition(existing?.metadata, acquisition) as object,
        },
      });

      await prisma.dataSubscription.upsert({
        where: { instrumentId: inst.id },
        create: {
          instrumentId: inst.id,
          sourceId: CFTC_COT_SOURCE.id,
          sourceSeriesKey: `kh3c-gbw2:${product.slug}:${metric}`,
          granularity: DataGranularity.WEEKLY,
          fetchMethod: DataFetchMethod.API,
          enabled: true,
          priority: 5,
          revisionLookback: 2,
          releaseRule: releaseRule as object,
          nextRunAt,
        },
        update: {
          sourceId: CFTC_COT_SOURCE.id,
          sourceSeriesKey: `kh3c-gbw2:${product.slug}:${metric}`,
          granularity: DataGranularity.WEEKLY,
          enabled: true,
          releaseRule: releaseRule as object,
          nextRunAt,
        },
      });
    }
  }

  console.log(`仪器: 新建 ${created}，更新 ${updated}（共 ${COT_MM_PRODUCTS.length} 品种 × 2）`);
}

async function syncDueSubscriptions(limit = 50) {
  const subs = await prisma.dataSubscription.findMany({
    where: { sourceId: CFTC_COT_SOURCE.id, enabled: true },
    include: {
      source: true,
      instrument: { select: { id: true, code: true, name: true, metadata: true } },
      releasePackage: {
        select: { id: true, releaseTemplate: true, scheduleState: true, nextRunAt: true },
      },
    },
    take: limit,
  });

  let ok = 0;
  let fail = 0;
  for (const sub of subs) {
    const result = await runDataSubscription(prisma, sub as SubscriptionWithRelations, {
      force: true,
    });
    if (result.status === "success" || result.status === "partial") ok++;
    else if (result.status === "failed") {
      fail++;
      console.warn(`[sync] ${sub.instrument.code}: ${result.error}`);
    }
  }
  console.log(`增量同步: 成功/部分 ${ok}，失败 ${fail}`);
}

async function main() {
  const skipBulk = process.argv.includes("--skip-bulk");
  const syncOnly = process.argv.includes("--sync-only");
  const bulkOnly = process.argv.includes("--bulk-only");

  if (bulkOnly) {
    console.log("历史回填（约 60 周）…");
    const bulk = await bulkImportCotHistory(prisma, { weeksBack: 60 });
    console.log(`回填完成: ${bulk.products} 品种, upsert ${bulk.upserted} 行`);
    return;
  }

  if (!syncOnly) {
    await ensureAgencyAndSource();
    await seedInstruments();
  }

  if (!skipBulk && !syncOnly) {
    console.log("历史回填（约 60 周）…");
    const bulk = await bulkImportCotHistory(prisma, { weeksBack: 60 });
    console.log(`回填完成: ${bulk.products} 品种, upsert ${bulk.upserted} 行`);
  }

  if (syncOnly || process.argv.includes("--sync")) {
    console.log("运行增量同步…");
    await syncDueSubscriptions();
  }

  clearFredCatalogCache();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
