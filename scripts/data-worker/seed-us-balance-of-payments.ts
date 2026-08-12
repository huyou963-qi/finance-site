/**
 * 美国国际收支 BEA/FRED 种子
 *
 * npm run data:seed-us-balance-of-payments
 * Spec: docs/specs/us-balance-of-payments.spec.md
 */
import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";
import {
  US_BALANCE_OF_PAYMENTS_FRED_SERIES,
  buildUsBalanceOfPaymentsInstrumentMetadata,
  releaseRuleForUsBalanceOfPaymentsFred,
} from "../../src/lib/data/scheduler/usBalanceOfPaymentsFredSeedCatalog";
import { P0_DATA_SOURCE_FRED } from "../../src/lib/data/scheduler/p0SeedCatalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

async function main() {
  console.log("[data:seed-us-balance-of-payments] 确保 FRED 数据源…");
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
  for (const row of US_BALANCE_OF_PAYMENTS_FRED_SERIES) {
    const existing = await prisma.instrument.findFirst({
      where: { OR: [{ code: row.code }, { fredSeriesId: row.fredId }] },
    });
    if (existing && existing.code !== row.code) {
      throw new Error(`${row.fredId} 已由 ${existing.code} 占用，停止避免重复 seed`);
    }
    if (existing) updated++;
    else created++;

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
    const metadata = buildUsBalanceOfPaymentsInstrumentMetadata(row, {
      existing: existingMetadata,
      dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10),
    });

    const instrument = await prisma.instrument.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        kind: InstrumentKind.MACRO_SERIES,
        name: row.name,
        freqLabel: row.freqLabel,
        unit: row.unit,
        fredSeriesId: row.fredId,
        metadata,
        externalRefs: {
          catalogKey: `fred:${row.fredId}`,
          agencyId: "us-fred",
          sourceId: "fred",
          usBalanceOfPaymentsCategory: row.category,
        },
      },
      update: {
        name: row.name,
        freqLabel: row.freqLabel,
        unit: row.unit,
        fredSeriesId: row.fredId,
        metadata,
        externalRefs: {
          catalogKey: `fred:${row.fredId}`,
          agencyId: "us-fred",
          sourceId: "fred",
          usBalanceOfPaymentsCategory: row.category,
        },
      },
    });

    const releaseRule = releaseRuleForUsBalanceOfPaymentsFred(row);
    const nextRunAt = computeNextRunAt(releaseRule, new Date());
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        sourceId: "fred",
        sourceSeriesKey: row.fredId,
        fetchMethod: DataFetchMethod.API,
        granularity: row.granularity,
        releaseRule,
        nextRunAt,
        enabled: true,
        priority: 8,
      },
      update: {
        sourceId: "fred",
        sourceSeriesKey: row.fredId,
        fetchMethod: DataFetchMethod.API,
        granularity: row.granularity,
        releaseRule,
        enabled: true,
        ...(nextRunAt ? { nextRunAt } : {}),
      },
    });
    console.log(`  ✓ ${row.code} (${row.fredId}) → ${row.releasePackageId}`);
  }

  console.log(
    `[data:seed-us-balance-of-payments] 完成 created=${created} updated=${updated}`,
  );
  console.log(
    "  下一步：data:seed-release-packages → data:sync-catalog-layout → data:sync-one（逐条全量回填）→ data:probe-sources → data:sync-calendar",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
