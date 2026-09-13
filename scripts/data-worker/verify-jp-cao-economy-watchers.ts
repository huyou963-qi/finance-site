import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchJpCaoWatchersWorkbook } from "../../src/lib/data/scheduler/jpCabinetEconomyWatchers/client";
import {
  JP_CAO_WATCHERS_PROVIDER,
  JP_CAO_WATCHERS_RELEASE_PACKAGE_ID,
  JP_CAO_WATCHERS_SERIES,
  JP_CAO_WATCHERS_SOURCE_ID,
} from "../../src/lib/data/scheduler/jpCabinetEconomyWatchers/catalog";
import { parseJpCaoWatchersWorkbook } from "../../src/lib/data/scheduler/jpCabinetEconomyWatchers/parser";

loadEnvConfig(process.cwd());

async function main() {
  assert.equal(new Set(JP_CAO_WATCHERS_SERIES.map((row) => row.instrumentCode)).size, JP_CAO_WATCHERS_SERIES.length);
  const fixturePath = process.argv.find((argument) => argument.startsWith("--fixture="))?.slice(10);
  if (fixturePath || process.argv.includes("--live")) {
    const parsed = parseJpCaoWatchersWorkbook(await fetchJpCaoWatchersWorkbook(fixturePath));
    for (const row of JP_CAO_WATCHERS_SERIES) {
      const points = parsed.series[row.instrumentCode];
      console.log(row.instrumentCode, points.length, points[0], points.at(-1));
    }
  }
  if (!process.argv.includes("--db")) {
    console.log(`[verify-jp-cao-economy-watchers] catalog ${JP_CAO_WATCHERS_SERIES.length} OK; --live/--db for source and DB checks`);
    return;
  }
  const prisma = new PrismaClient();
  try {
    for (const row of JP_CAO_WATCHERS_SERIES) {
      const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: row.instrumentCode } });
      const metadata = instrument.metadata as Record<string, unknown>;
      assert.equal(metadata.countryCode, "JP");
      assert.equal(metadata.catalogKey, `mds:${row.instrumentCode}`);
      assert.equal(metadata.catalogCategory, "国民经济");
      assert.equal(metadata.catalogSubgroup, "景气调查");
      assert.equal((metadata.scrape as Record<string, unknown>).provider, JP_CAO_WATCHERS_PROVIDER);
      assert.equal((metadata.fetchAcquisition as Record<string, unknown>).status, "known");
      const subscription = await prisma.dataSubscription.findUniqueOrThrow({ where: { instrumentId: instrument.id } });
      assert.equal(subscription.sourceId, JP_CAO_WATCHERS_SOURCE_ID);
      assert.equal(subscription.enabled, true);
      assert.ok(subscription.nextRunAt);
      assert.equal(subscription.releasePackageId, JP_CAO_WATCHERS_RELEASE_PACKAGE_ID);
      assert.equal(subscription.granularity, "MONTHLY");
      const observations = await prisma.macroObservation.findMany({
        where: { instrumentId: instrument.id }, orderBy: { obsDate: "asc" },
      });
      assert.ok(observations.length >= 296, `${row.instrumentCode} incomplete history`);
      assert.equal(observations[0].obsDate.toISOString().slice(0, 10), "2002-01-01");
      const latest = observations.at(-1)!;
      assert.ok(Date.now() - latest.obsDate.getTime() < 90 * 86400000, `${row.instrumentCode} stale`);
      assert.ok(observations.every((point) => point.value >= 0 && point.value <= 100));
      for (let index = 1; index < observations.length; index++) {
        const previous = observations[index - 1].obsDate;
        assert.equal(observations[index].obsDate.getTime(), Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 1));
      }
      const vintages = await prisma.macroObservationVintage.count({ where: { instrumentId: instrument.id } });
      assert.ok(vintages >= observations.length, `${row.instrumentCode} missing version capture`);
      console.log(`verified ${row.instrumentCode}: ${observations.length}; latest=${latest.obsDate.toISOString().slice(0, 10)} ${latest.value}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
