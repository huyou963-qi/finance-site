import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { BOJ_SOURCE_ID } from "../../src/lib/data/scheduler/boj/catalog";
import { fetchBojSeries } from "../../src/lib/data/scheduler/boj/client";
import { parseBojResponse } from "../../src/lib/data/scheduler/boj/parser";
import {
  JP_BOJ_BOP_PACKAGE_ID,
  JP_BOJ_BOP_SERIES,
} from "../../src/lib/data/scheduler/bojExternal/catalog";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";

loadEnvConfig(process.cwd());

async function main() {
  assert.equal(new Set(JP_BOJ_BOP_SERIES.map((row) => row.instrumentCode)).size, 8);
  if (process.argv.includes("--live")) {
    for (const row of JP_BOJ_BOP_SERIES) {
      const parsed = parseBojResponse(await fetchBojSeries(row), row);
      assert.ok(parsed.points.length >= 360);
      assert.equal(parsed.points[0].obsDate.toISOString().slice(0, 10), "1996-01-01");
      assert(Date.now() - parsed.points.at(-1)!.obsDate.getTime() < 120 * 86_400_000);
      console.log(
        "source verified",
        row.instrumentCode,
        parsed.points.length,
        parsed.points.at(-1)!.obsDate.toISOString().slice(0, 10),
      );
    }
  }
  if (!process.argv.includes("--db")) return;
  const prisma = new PrismaClient();
  try {
    for (const row of JP_BOJ_BOP_SERIES) {
      const instrument = await prisma.instrument.findUniqueOrThrow({
        where: { code: row.instrumentCode },
      });
      assert.equal(instrument.freqLabel, row.freqLabel);
      assert.equal(instrument.unit, row.unit);
      assert.equal(readFetchAcquisition(instrument.metadata)?.status, "known");
      const metadata = instrument.metadata as Record<string, unknown>;
      assert.equal(metadata.countryCode, "JP");
      assert.equal(metadata.catalogCategory, "对外与汇率");
      assert.equal(metadata.catalogSubgroup, "国际收支");
      assert.equal(metadata.valueConcept, "official net balance");
      const subscription = await prisma.dataSubscription.findUniqueOrThrow({
        where: { instrumentId: instrument.id },
      });
      assert.equal(subscription.sourceId, BOJ_SOURCE_ID);
      assert.equal(subscription.enabled, true);
      assert(subscription.nextRunAt);
      assert.equal(subscription.fetchMethod, "API");
      assert.deepEqual(subscription.releaseRule, { type: "probe_interval", intervalHours: 72 });
      assert.equal(subscription.releasePackageId, JP_BOJ_BOP_PACKAGE_ID);
      const member = await prisma.releasePackageMember.findUniqueOrThrow({
        where: { instrumentId: instrument.id },
      });
      assert.equal(member.packageId, JP_BOJ_BOP_PACKAGE_ID);
      const successfulRuns = await prisma.fetchRun.count({
        where: { subscriptionId: subscription.id, status: "SUCCESS" },
      });
      assert(successfulRuns > 0, `missing successful fetch: ${row.instrumentCode}`);
      const observations = await prisma.macroObservation.findMany({
        where: { instrumentId: instrument.id },
        orderBy: { obsDate: "asc" },
      });
      assert(observations.length >= 360);
      assert.equal(observations[0].obsDate.toISOString().slice(0, 10), "1996-01-01");
      assert(Date.now() - observations.at(-1)!.obsDate.getTime() < 120 * 86_400_000);
      console.log(
        "db verified",
        row.instrumentCode,
        observations.length,
        observations.at(-1)!.obsDate.toISOString().slice(0, 10),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log(`jp-boj-bop verify PASS (${JP_BOJ_BOP_SERIES.length} series)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Japan BOJ BOP verify failed");
  process.exitCode = 1;
});
