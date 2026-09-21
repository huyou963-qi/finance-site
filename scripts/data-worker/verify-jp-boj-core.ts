import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { BOJ_SOURCE_ID } from "../../src/lib/data/scheduler/boj/catalog";
import { fetchBojSeries } from "../../src/lib/data/scheduler/boj/client";
import { parseBojResponse } from "../../src/lib/data/scheduler/boj/parser";
import { JP_BOJ_CORE_SERIES } from "../../src/lib/data/scheduler/bojCore/catalog";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";

loadEnvConfig(process.cwd());

/** 季度资金循环 1997Q4 起；日本银行勘定（BS01）1998-04 起；其余月度 1985 年前起 */
function minPointsFor(row: (typeof JP_BOJ_CORE_SERIES)[number]): number {
  return row.db === "FF" ? 110 : row.db === "BS01" ? 330 : 490;
}

async function main() {
  assert.equal(JP_BOJ_CORE_SERIES.length, 12);
  assert.equal(new Set(JP_BOJ_CORE_SERIES.map((row) => row.instrumentCode)).size, 12);

  if (process.argv.includes("--live")) {
    for (const row of JP_BOJ_CORE_SERIES) {
      const parsed = parseBojResponse(await fetchBojSeries(row), row);
      assert.ok(parsed.points.length >= minPointsFor(row));
      const maxAgeDays = row.db === "FF" ? 300 : 75;
      assert.ok(
        Date.now() - parsed.points.at(-1)!.obsDate.getTime() < maxAgeDays * 86_400_000,
        `stale source ${row.instrumentCode}`,
      );
      console.log(
        "source verified",
        row.instrumentCode,
        parsed.points.length,
        parsed.points.at(-1)!.obsDate.toISOString().slice(0, 10),
      );
    }
  }

  if (!process.argv.includes("--db")) {
    console.log(`jp-boj-core catalogue PASS (${JP_BOJ_CORE_SERIES.length} series)`);
    return;
  }

  const prisma = new PrismaClient();
  try {
    for (const row of JP_BOJ_CORE_SERIES) {
      const instrument = await prisma.instrument.findUniqueOrThrow({
        where: { code: row.instrumentCode },
      });
      assert.equal(instrument.freqLabel, row.freqLabel);
      assert.equal(instrument.unit, row.unit);
      assert.equal(readFetchAcquisition(instrument.metadata)?.status, "known");
      const metadata = instrument.metadata as Record<string, unknown>;
      assert.equal(metadata.countryCode, "JP");
      assert.equal(metadata.catalogKey, `mds:${row.instrumentCode}`);
      assert.equal(metadata.catalogCategory, row.category);
      assert.equal(metadata.catalogSubgroup, row.subgroup);
      assert.equal(metadata.sourceSeriesCode, row.seriesCode);
      assert.equal(metadata.sourceDatabase, row.db);

      const subscription = await prisma.dataSubscription.findUniqueOrThrow({
        where: { instrumentId: instrument.id },
      });
      assert.equal(subscription.sourceId, BOJ_SOURCE_ID);
      assert.equal(subscription.enabled, true);
      assert.ok(subscription.nextRunAt);
      assert.equal(subscription.fetchMethod, "API");
      assert.equal(subscription.granularity, row.frequency);
      assert.deepEqual(subscription.releaseRule, {
        type: "probe_interval",
        intervalHours: row.probeIntervalHours,
      });
      assert.equal(subscription.releasePackageId, row.releasePackageId);
      const member = await prisma.releasePackageMember.findUniqueOrThrow({
        where: { instrumentId: instrument.id },
      });
      assert.equal(member.packageId, row.releasePackageId);

      const successfulRuns = await prisma.fetchRun.count({
        where: { subscriptionId: subscription.id, status: "SUCCESS" },
      });
      assert.ok(successfulRuns > 0, `missing successful fetch ${row.instrumentCode}`);
      const observations = await prisma.macroObservation.findMany({
        where: { instrumentId: instrument.id },
        orderBy: { obsDate: "asc" },
      });
      assert.ok(observations.length >= minPointsFor(row));
      const maxAgeDays = row.db === "FF" ? 300 : 75;
      assert.ok(
        Date.now() - observations.at(-1)!.obsDate.getTime() < maxAgeDays * 86_400_000,
        `stale DB ${row.instrumentCode}`,
      );
      const vintages = await prisma.macroObservationVintage.count({
        where: { instrumentId: instrument.id },
      });
      assert.ok(vintages >= observations.length, `missing vintages ${row.instrumentCode}`);
      console.log(
        JSON.stringify({
          code: row.instrumentCode,
          count: observations.length,
          first: observations[0].obsDate.toISOString().slice(0, 10),
          last: observations.at(-1)!.obsDate.toISOString().slice(0, 10),
          latestValue: observations.at(-1)!.value,
          vintages,
          nextRunAt: subscription.nextRunAt.toISOString(),
          releasePackage: subscription.releasePackageId,
        }),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log(`jp-boj-core verify PASS (${JP_BOJ_CORE_SERIES.length} series)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Japan BOJ core verify failed");
  process.exitCode = 1;
});
