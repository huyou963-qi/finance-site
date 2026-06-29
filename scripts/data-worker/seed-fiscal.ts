/**
 * 美国财政分析 — Treasury + FRED 种子
 *
 * npm run data:seed-fiscal
 * npm run data:sync-fiscal
 */
import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import { clearFredCatalogCache } from "../../src/lib/data/fredCatalog";
import {
  FISCAL_FRED_ALREADY_IN_OVERVIEW,
  FISCAL_FRED_SERIES,
  FISCAL_FRED_YOY_SERIES,
  buildFiscalFredInstrumentMetadata,
  releaseRuleForFiscalFred,
} from "../../src/lib/data/scheduler/fiscalFredSeedCatalog";
import {
  FISCAL_COMPOSITE_SERIES,
  buildFiscalCompositeInstrumentMetadata,
} from "../../src/lib/data/scheduler/fiscalCompositeFred";
import { computeNextRunAt, defaultReleaseRuleForGranularity } from "../../src/lib/data/scheduler/releaseRule";
import { P0_DATA_SOURCE_FRED } from "../../src/lib/data/scheduler/p0SeedCatalog";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";
import {
  TREASURY_FISCAL_SERIES,
  buildTreasuryInstrumentMetadata,
  treasurySourceSeriesKey,
} from "../../src/lib/data/scheduler/treasuryFiscalSeedCatalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

const TREASURY_DATA_SOURCE = {
  id: "treasury-fiscal-data",
  agencyId: "us-treasury",
  name: "Treasury Fiscal Data API",
  adapterKind: SourceAdapterKind.REST_API,
  baseUrl: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service",
  termsUrl: "https://fiscaldata.treasury.gov/api-documentation/",
  rateLimit: { requestsPerMinute: 60, minIntervalMs: 1000 },
} as const;

async function ensureAgencyAndSource() {
  await prisma.statisticalAgency.upsert({
    where: { id: TREASURY_DATA_SOURCE.agencyId },
    create: {
      id: TREASURY_DATA_SOURCE.agencyId,
      countryCode: "US",
      nameZh: "美国财政部",
      nameEn: "U.S. Department of the Treasury",
      websiteUrl: "https://home.treasury.gov/",
    },
    update: {
      countryCode: "US",
      nameZh: "美国财政部",
      nameEn: "U.S. Department of the Treasury",
      websiteUrl: "https://home.treasury.gov/",
    },
  });

  await prisma.dataSource.upsert({
    where: { id: TREASURY_DATA_SOURCE.id },
    create: {
      id: TREASURY_DATA_SOURCE.id,
      agencyId: TREASURY_DATA_SOURCE.agencyId,
      name: TREASURY_DATA_SOURCE.name,
      adapterKind: TREASURY_DATA_SOURCE.adapterKind,
      baseUrl: TREASURY_DATA_SOURCE.baseUrl,
      termsUrl: TREASURY_DATA_SOURCE.termsUrl,
      rateLimit: TREASURY_DATA_SOURCE.rateLimit,
    },
    update: {
      agencyId: TREASURY_DATA_SOURCE.agencyId,
      name: TREASURY_DATA_SOURCE.name,
      adapterKind: TREASURY_DATA_SOURCE.adapterKind,
      baseUrl: TREASURY_DATA_SOURCE.baseUrl,
      termsUrl: TREASURY_DATA_SOURCE.termsUrl,
      rateLimit: TREASURY_DATA_SOURCE.rateLimit,
    },
  });

  await prisma.dataSource.upsert({
    where: { id: P0_DATA_SOURCE_FRED.id },
    create: {
      id: P0_DATA_SOURCE_FRED.id,
      agencyId: P0_DATA_SOURCE_FRED.agencyId,
      name: P0_DATA_SOURCE_FRED.name,
      adapterKind: P0_DATA_SOURCE_FRED.adapterKind,
      baseUrl: P0_DATA_SOURCE_FRED.baseUrl,
      termsUrl: P0_DATA_SOURCE_FRED.termsUrl,
      rateLimit: P0_DATA_SOURCE_FRED.rateLimit,
    },
    update: {},
  });
}

async function seedTreasurySeries() {
  let created = 0;
  let updated = 0;

  for (const row of TREASURY_FISCAL_SERIES) {
    const sourceSeriesKey = treasurySourceSeriesKey(row);
    const releaseRule = defaultReleaseRuleForGranularity(row.granularity);
    const nextRunAt = computeNextRunAt(releaseRule, new Date());

    const existing = await prisma.instrument.findUnique({ where: { code: row.code } });
    if (existing) updated++;
    else created++;

    const latestObs = existing
      ? await prisma.macroObservation.findFirst({
          where: { instrumentId: existing.id },
          orderBy: { obsDate: "desc" },
        })
      : null;

    const metadata = buildTreasuryInstrumentMetadata(row, {
      dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10) ?? null,
      existing:
        existing?.metadata && typeof existing.metadata === "object"
          ? (existing.metadata as Record<string, unknown>)
          : null,
    });

    const inst = await prisma.instrument.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        name: row.name,
        kind: InstrumentKind.MACRO_SERIES,
        freqLabel: row.freqLabel,
        unit: row.unit,
        metadata: metadata as object,
      },
      update: {
        name: row.name,
        freqLabel: row.freqLabel,
        unit: row.unit,
        metadata: metadata as object,
      },
    });

    await prisma.dataSubscription.upsert({
      where: { instrumentId: inst.id },
      create: {
        instrumentId: inst.id,
        sourceId: TREASURY_DATA_SOURCE.id,
        sourceSeriesKey,
        granularity: row.granularity,
        fetchMethod: DataFetchMethod.API,
        enabled: true,
        priority: 48,
        releaseRule: releaseRule as object,
        nextRunAt,
      },
      update: {
        sourceId: TREASURY_DATA_SOURCE.id,
        sourceSeriesKey,
        granularity: row.granularity,
        fetchMethod: DataFetchMethod.API,
        enabled: true,
        releaseRule: releaseRule as object,
        nextRunAt,
      },
    });

    console.info(`  [treasury] ${row.code} ← ${row.roleId}`);
  }

  console.info(`[treasury] created=${created} updated=${updated} total=${TREASURY_FISCAL_SERIES.length}`);
}

async function seedFiscalFredSeries() {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of FISCAL_FRED_SERIES) {
    if (FISCAL_FRED_ALREADY_IN_OVERVIEW.has(row.fredId)) {
      skipped++;
      continue;
    }

    const rule = releaseRuleForFiscalFred(row.fredId, row.granularity);
    const nextRunAt = computeNextRunAt(rule, new Date());
    const existing = await prisma.instrument.findUnique({ where: { code: row.code } });
    if (existing) updated++;
    else created++;

    const latestObs = await prisma.macroObservation.findFirst({
      where: { instrument: { code: row.code } },
      orderBy: { obsDate: "desc" },
    });

    const metadata = buildFiscalFredInstrumentMetadata(row, {
      dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10) ?? null,
      existing:
        existing?.metadata && typeof existing.metadata === "object"
          ? (existing.metadata as Record<string, unknown>)
          : null,
    });

    const inst = await prisma.instrument.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        name: row.name,
        kind: InstrumentKind.MACRO_SERIES,
        freqLabel: row.freqLabel,
        unit: row.unit,
        metadata: metadata as object,
      },
      update: {
        name: row.name,
        freqLabel: row.freqLabel,
        unit: row.unit,
        metadata: metadata as object,
      },
    });

    await prisma.dataSubscription.upsert({
      where: { instrumentId: inst.id },
      create: {
        instrumentId: inst.id,
        sourceId: P0_DATA_SOURCE_FRED.id,
        sourceSeriesKey: row.fredId,
        granularity: row.granularity,
        fetchMethod: DataFetchMethod.API,
        enabled: true,
        priority: 46,
        releaseRule: rule as object,
        nextRunAt,
      },
      update: {
        sourceId: P0_DATA_SOURCE_FRED.id,
        sourceSeriesKey: row.fredId,
        granularity: row.granularity,
        fetchMethod: DataFetchMethod.API,
        enabled: true,
        releaseRule: rule as object,
        nextRunAt,
      },
    });

    console.info(`  [fred] ${row.code} ← ${row.fredId}`);
  }

  console.info(`[fred] created=${created} updated=${updated} skipped=${skipped}`);
}

async function seedFiscalFredYoySeries() {
  for (const row of FISCAL_FRED_YOY_SERIES) {
    const rule = releaseRuleForFiscalFred(row.fredId, row.granularity);
    const nextRunAt = computeNextRunAt(rule, new Date());
    const existing = await prisma.instrument.findUnique({ where: { code: row.code } });

    const latestObs = existing
      ? await prisma.macroObservation.findFirst({
          where: { instrumentId: existing.id },
          orderBy: { obsDate: "desc" },
        })
      : null;

    const metadata = buildFiscalFredInstrumentMetadata(row, {
      dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10) ?? null,
      existing:
        existing?.metadata && typeof existing.metadata === "object"
          ? (existing.metadata as Record<string, unknown>)
          : null,
    });

    const inst = await prisma.instrument.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        name: row.name,
        kind: InstrumentKind.MACRO_SERIES,
        freqLabel: row.freqLabel,
        unit: row.unit,
        metadata: metadata as object,
      },
      update: {
        name: row.name,
        freqLabel: row.freqLabel,
        unit: row.unit,
        metadata: metadata as object,
      },
    });

    await prisma.dataSubscription.upsert({
      where: { instrumentId: inst.id },
      create: {
        instrumentId: inst.id,
        sourceId: P0_DATA_SOURCE_FRED.id,
        sourceSeriesKey: row.fredId,
        granularity: row.granularity,
        fetchMethod: DataFetchMethod.API,
        enabled: true,
        priority: 46,
        releaseRule: rule as object,
        nextRunAt,
      },
      update: {
        sourceId: P0_DATA_SOURCE_FRED.id,
        sourceSeriesKey: row.fredId,
        granularity: row.granularity,
        fetchMethod: DataFetchMethod.API,
        enabled: true,
        releaseRule: rule as object,
        nextRunAt,
      },
    });

    console.info(`  [fred-yoy] ${row.code} ← ${row.fredId}`);
  }
}

async function seedFiscalCompositeSeries() {
  for (const row of FISCAL_COMPOSITE_SERIES) {
    const rule = releaseRuleForFiscalFred("FYFSGDA188S", row.granularity);
    const nextRunAt = computeNextRunAt(rule, new Date());
    const existing = await prisma.instrument.findUnique({ where: { code: row.code } });

    const latestObs = existing
      ? await prisma.macroObservation.findFirst({
          where: { instrumentId: existing.id },
          orderBy: { obsDate: "desc" },
        })
      : null;

    const metadata = buildFiscalCompositeInstrumentMetadata(row, {
      dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10) ?? null,
      existing:
        existing?.metadata && typeof existing.metadata === "object"
          ? (existing.metadata as Record<string, unknown>)
          : null,
    });

    const inst = await prisma.instrument.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        name: row.name,
        kind: InstrumentKind.MACRO_SERIES,
        freqLabel: row.freqLabel,
        unit: row.unit,
        metadata: metadata as object,
      },
      update: {
        name: row.name,
        freqLabel: row.freqLabel,
        unit: row.unit,
        metadata: metadata as object,
      },
    });

    await prisma.dataSubscription.upsert({
      where: { instrumentId: inst.id },
      create: {
        instrumentId: inst.id,
        sourceId: P0_DATA_SOURCE_FRED.id,
        sourceSeriesKey: "COMPOSITE",
        granularity: row.granularity,
        fetchMethod: DataFetchMethod.API,
        enabled: true,
        priority: 46,
        releaseRule: rule as object,
        nextRunAt,
      },
      update: {
        sourceId: P0_DATA_SOURCE_FRED.id,
        sourceSeriesKey: "COMPOSITE",
        granularity: row.granularity,
        fetchMethod: DataFetchMethod.API,
        enabled: true,
        releaseRule: rule as object,
        nextRunAt,
      },
    });

    console.info(`  [composite] ${row.code} ← ${row.roleId}`);
  }
}

async function syncAllFiscalSubscriptions() {
  const codes = [
    ...TREASURY_FISCAL_SERIES.map((r) => r.code),
    ...FISCAL_FRED_SERIES.filter((r) => !FISCAL_FRED_ALREADY_IN_OVERVIEW.has(r.fredId)).map(
      (r) => r.code,
    ),
    ...FISCAL_FRED_YOY_SERIES.map((r) => r.code),
    ...FISCAL_COMPOSITE_SERIES.map((r) => r.code),
  ];

  console.info("[data:seed-fiscal] 拉取观测…");
  for (const code of codes) {
    const sub = await prisma.dataSubscription.findFirst({
      where: { instrument: { code } },
      include: {
        source: true,
        instrument: { select: { id: true, code: true, name: true, metadata: true } },
      },
    });
    if (!sub) {
      console.warn(`  ✗ 无订阅 ${code}`);
      continue;
    }
    try {
      const result = await runDataSubscription(prisma, sub, { force: true });
      console.info(
        `  ${code}: ${result.status} (+${result.rowsUpserted} upsert, skip ${result.rowsSkipped})`,
      );
    } catch (e) {
      console.error(`  ✗ ${code}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

async function main() {
  const syncOnly = process.argv.includes("--sync-only");
  if (!syncOnly) {
    console.info("[data:seed-fiscal] 机构与数据源…");
    await ensureAgencyAndSource();
    console.info("[data:seed-fiscal] Treasury 序列…");
    await seedTreasurySeries();
    console.info("[data:seed-fiscal] FRED 财政序列…");
    await seedFiscalFredSeries();
    console.info("[data:seed-fiscal] FRED YoY / 复合…");
    await seedFiscalFredYoySeries();
    await seedFiscalCompositeSeries();
  }
  await syncAllFiscalSubscriptions();
  clearFredCatalogCache();
  console.info("[data:seed-fiscal] 完成");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
