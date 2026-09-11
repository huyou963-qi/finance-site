/** Seed the BLS/FRED Final Demand PPI source indices. */
import { loadEnvConfig } from "@next/env";
import { DataFetchMethod, InstrumentKind, PrismaClient, SourceAdapterKind } from "@prisma/client";
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";
import {
  buildPpiInstrumentMetadata,
  PPI_FRED_SERIES,
  PPI_REUSED_FRED_IDS,
  releaseRuleForPpiFred,
} from "../../src/lib/data/scheduler/ppiFredSeedCatalog";
import { P0_DATA_SOURCE_FRED } from "../../src/lib/data/scheduler/p0SeedCatalog";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  await prisma.dataSource.upsert({
    where: { id: P0_DATA_SOURCE_FRED.id },
    create: { ...P0_DATA_SOURCE_FRED, adapterKind: SourceAdapterKind.FRED_API },
    update: {},
  });

  let created = 0;
  let updated = 0;
  let reused = 0;
  for (const item of PPI_FRED_SERIES) {
    if (PPI_REUSED_FRED_IDS.has(item.fredId)) {
      reused++;
      console.log(`  ↷ 复用 ${item.code} (${item.fredId})；由 CPI catalog 维护`);
      continue;
    }
    const existing = await prisma.instrument.findUnique({ where: { code: item.code } });
    const existingMeta =
      existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : null;
    const rule = releaseRuleForPpiFred(item.fredId, item.granularity);
    const instrument = await prisma.instrument.upsert({
      where: { code: item.code },
      create: {
        code: item.code,
        kind: InstrumentKind.MACRO_SERIES,
        name: item.name,
        freqLabel: item.freqLabel,
        unit: item.unit,
        fredSeriesId: item.fredId,
        metadata: buildPpiInstrumentMetadata(item, existingMeta),
        externalRefs: { catalogKey: `fred:${item.fredId}`, agencyId: "us-fred", sourceId: "fred" },
      },
      update: {
        name: item.name,
        freqLabel: item.freqLabel,
        unit: item.unit,
        fredSeriesId: item.fredId,
        metadata: buildPpiInstrumentMetadata(item, existingMeta),
        externalRefs: { catalogKey: `fred:${item.fredId}`, agencyId: "us-fred", sourceId: "fred" },
      },
    });
    if (existing) updated++; else created++;
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        sourceId: "fred",
        sourceSeriesKey: item.fredId,
        fetchMethod: DataFetchMethod.API,
        granularity: item.granularity,
        releaseRule: rule,
        nextRunAt: computeNextRunAt(rule),
        enabled: true,
        priority: 9,
      },
      update: {
        sourceId: "fred",
        sourceSeriesKey: item.fredId,
        granularity: item.granularity,
        releaseRule: rule,
        enabled: true,
      },
    });
    console.log(`  ✓ ${item.code} (${item.fredId})`);
  }
  console.log(`[data:seed-ppi] created=${created} updated=${updated} reused=${reused}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
