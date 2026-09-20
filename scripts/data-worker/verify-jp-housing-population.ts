import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  JP_HOUSING_POPULATION_ESTAT_SERIES,
  JP_HOUSING_POPULATION_SERIES_COUNT,
  JP_MLIT_PROPERTY_PRICE_SERIES,
} from "../../src/lib/data/scheduler/jpHousingPopulation/catalog";

loadEnvConfig(process.cwd());
async function main() {
  assert.equal(JP_HOUSING_POPULATION_SERIES_COUNT, 11);
  assert.equal(new Set([...JP_HOUSING_POPULATION_ESTAT_SERIES.map((series) => series.instrumentCode), JP_MLIT_PROPERTY_PRICE_SERIES.instrumentCode]).size, 11);
  for (const series of JP_HOUSING_POPULATION_ESTAT_SERIES) {
    assert.ok(series.eStat.statsDataId.length > 0);
    assert.ok(Object.keys(series.eStat.filters).length > 0);
  }
  if (!process.argv.includes("--db")) return;
  const prisma = new PrismaClient();
  try {
    for (const series of [...JP_HOUSING_POPULATION_ESTAT_SERIES, JP_MLIT_PROPERTY_PRICE_SERIES]) {
      const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: series.instrumentCode } });
      const metadata = instrument.metadata as Record<string, unknown>;
      assert.equal(metadata.countryCode, "JP");
      assert.equal(metadata.catalogKey, `mds:${series.instrumentCode}`);
      assert.equal(instrument.unit, series.unit);
      const subscription = await prisma.dataSubscription.findUniqueOrThrow({ where: { instrumentId: instrument.id } });
      assert.equal(subscription.enabled, true);
      assert.ok(subscription.nextRunAt);
      const first = await prisma.macroObservation.findFirst({ where: { instrumentId: instrument.id }, orderBy: { obsDate: "asc" } });
      const latest = await prisma.macroObservation.findFirst({ where: { instrumentId: instrument.id }, orderBy: { obsDate: "desc" } });
      assert.ok(first && latest, `${series.instrumentCode} has no observations`);
      assert.ok(latest.value > 0, `${series.instrumentCode} latest non-positive`);
      console.log("verified", series.instrumentCode, first.obsDate.toISOString().slice(0, 10), latest.obsDate.toISOString().slice(0, 10), latest.value);
    }
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
