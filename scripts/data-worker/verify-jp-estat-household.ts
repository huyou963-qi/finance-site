import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  JP_ESTAT_HOUSEHOLD_HISTORY_START,
  JP_ESTAT_HOUSEHOLD_PACKAGE_ID,
  JP_ESTAT_HOUSEHOLD_SERIES,
  buildJpEStatHouseholdMetadata,
} from "../../src/lib/data/scheduler/eStat/householdCatalog";
import { fetchEStatIncremental, parseEStatObservations } from "../../src/lib/data/scheduler/adapters/eStatAdapter";

loadEnvConfig(process.cwd());

async function main() {
  assert.equal(JP_ESTAT_HOUSEHOLD_SERIES.length, 4);
  assert.equal(new Set(JP_ESTAT_HOUSEHOLD_SERIES.map((series) => series.instrumentCode)).size, 4);
  for (const series of JP_ESTAT_HOUSEHOLD_SERIES) {
    assert.equal(Object.keys(series.eStat.filters).length, 4);
    assert.equal(series.eStat.historyStart, JP_ESTAT_HOUSEHOLD_HISTORY_START);
    assert.equal(series.eStat.expectedUnit, "円");
    const fixture = JSON.parse(readFileSync(join(process.cwd(), "scripts/data-worker/fixtures/jp-estat-household", `${series.fixtureName}.json`), "utf8"));
    const points = parseEStatObservations(fixture, series.eStat);
    assert.equal(points.length, 319);
    assert.equal(points[0]?.obsDate.toISOString().slice(0, 10), JP_ESTAT_HOUSEHOLD_HISTORY_START);
    assert.equal(points.at(-1)?.obsDate.toISOString().slice(0, 10), "2026-07-01");
    assert.throws(() => parseEStatObservations(fixture, { ...series.eStat, expectedUnit: "％" }));
    console.log("fixture verified", series.instrumentCode, points.length, points.at(-1)?.value);
  }

  if (process.argv.includes("--live")) {
    for (const series of JP_ESTAT_HOUSEHOLD_SERIES) {
      const result = await fetchEStatIncremental(series.eStat.statsDataId, "1950-01-01", buildJpEStatHouseholdMetadata(series));
      assert.equal(result.points.length, 319);
      assert.equal(result.skippedInvalid, 0);
      console.log("live verified", series.instrumentCode, result.points.length, result.points.at(-1));
    }
  }

  if (!process.argv.includes("--db")) return;
  const prisma = new PrismaClient();
  try {
    for (const series of JP_ESTAT_HOUSEHOLD_SERIES) {
      const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: series.instrumentCode } });
      const metadata = instrument.metadata as Record<string, unknown>;
      assert.equal(instrument.unit, series.unit);
      assert.equal(instrument.freqLabel, "月");
      assert.equal(metadata.countryCode, "JP");
      assert.equal(metadata.catalogKey, `mds:${series.instrumentCode}`);
      assert.equal(metadata.seasonalAdjustment, "NSA");
      assert.equal(metadata.priceBasis, "nominal");
      assert.deepEqual(metadata.eStat, series.eStat);
      assert.equal((metadata.fetchAcquisition as { status: string }).status, "known");
      const subscription = await prisma.dataSubscription.findUniqueOrThrow({
        where: { instrumentId: instrument.id },
        include: { releasePackage: true },
      });
      assert(subscription.enabled);
      assert(subscription.nextRunAt);
      assert.equal(subscription.sourceId, "estat-jp");
      assert.equal(subscription.sourceSeriesKey, series.eStat.statsDataId);
      assert.equal((subscription.releaseRule as { type: string }).type, "probe_interval");
      assert.equal((subscription.releaseRule as { intervalHours: number }).intervalHours, 24);
      assert.equal(subscription.releasePackage?.id, JP_ESTAT_HOUSEHOLD_PACKAGE_ID);
      const points = await prisma.macroObservation.findMany({
        where: { instrumentId: instrument.id },
        orderBy: { obsDate: "asc" },
      });
      assert.equal(points.length, 319);
      assert.equal(points[0]?.obsDate.toISOString().slice(0, 10), JP_ESTAT_HOUSEHOLD_HISTORY_START);
      assert(Date.now() - points.at(-1)!.obsDate.getTime() < 100 * 86_400_000, "source stale");
      assert(points.every((point) => point.value > 0 && point.value < 2_000_000));
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1]!.obsDate;
        assert.equal(points[index]!.obsDate.getTime(), Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 1), "unexpected monthly gap");
      }
      console.log(
        "verified",
        series.instrumentCode,
        points.length,
        points[0]!.obsDate.toISOString().slice(0, 10),
        points.at(-1)!.obsDate.toISOString().slice(0, 10),
        points.at(-1)!.value,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Household Survey verification failed");
  process.exitCode = 1;
});
