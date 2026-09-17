/**
 * 美国零售销售分项（Census Advance Monthly Retail Trade Survey）FRED 种子
 *
 * npm run data:seed-us-retail-sales
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
  US_RETAIL_SALES_FRED_SERIES,
  buildUsRetailSalesInstrumentMetadata,
  releaseRuleForUsRetailSalesFred,
} from "../../src/lib/data/scheduler/usRetailSalesFredSeedCatalog";
import { P0_DATA_SOURCE_FRED } from "../../src/lib/data/scheduler/p0SeedCatalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

async function main() {
  console.log("[data:seed-us-retail-sales] 确保 FRED 数据源…");
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

  console.log("[data:seed-us-retail-sales] 写入零售销售分项 FRED 序列与订阅…");
  for (const row of US_RETAIL_SALES_FRED_SERIES) {
    const rule = releaseRuleForUsRetailSalesFred(row);
    const nextRunAt = computeNextRunAt(rule, new Date());

    const existing = await prisma.instrument.findUnique({ where: { code: row.code } });
    if (existing) updated++;
    else created++;

    const latestObs = await prisma.macroObservation.findFirst({
      where: { instrument: { code: row.code } },
      orderBy: { obsDate: "desc" },
      select: { obsDate: true },
    });
    const dataLastObsDateIso = latestObs?.obsDate.toISOString().slice(0, 10) ?? null;
    const existingMeta =
      existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : null;
    const metadata = buildUsRetailSalesInstrumentMetadata(row, {
      dataLastObsDateIso,
      existing: existingMeta,
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
          usRetailSalesCategory: row.category,
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
          usRetailSalesCategory: row.category,
        },
      },
    });

    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        sourceId: "fred",
        sourceSeriesKey: row.fredId,
        fetchMethod: DataFetchMethod.API,
        granularity: row.granularity,
        releaseRule: rule,
        nextRunAt,
        enabled: true,
        priority: 8,
      },
      update: {
        sourceSeriesKey: row.fredId,
        granularity: row.granularity,
        releaseRule: rule,
        enabled: true,
        ...(nextRunAt ? { nextRunAt } : {}),
      },
    });

    console.log(`  ✓ ${row.code} (${row.fredId})`);
  }

  console.log(
    `[data:seed-us-retail-sales] 完成 created=${created} updated=${updated}`,
  );
  console.log(
    "  下一步：npm run data:seed-release-packages && npm run data:sync-catalog-layout -- --keys=" +
      US_RETAIL_SALES_FRED_SERIES.map((r) => `fred:${r.fredId}`).join(","),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
