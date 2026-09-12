import assert from "node:assert/strict";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  JP_MHLW_MONTHLY_LABOUR_PACKAGE_ID,
  JP_MHLW_MONTHLY_LABOUR_PROVIDER,
  JP_MHLW_MONTHLY_LABOUR_SERIES,
} from "../../src/lib/data/scheduler/jpMhlwMonthlyLabour/catalog";
import { fetchJpMhlwMonthlyLabourWorkbook } from "../../src/lib/data/scheduler/jpMhlwMonthlyLabour/client";
import { parseJpMhlwMonthlyLabourWorkbook } from "../../src/lib/data/scheduler/jpMhlwMonthlyLabour/parser";

loadEnvConfig(process.cwd());

async function main() {
  const fixtureDir = process.argv.find((arg) => arg.startsWith("--fixture-dir="))?.slice(14);
  if (fixtureDir || process.argv.includes("--live")) {
    for (const series of JP_MHLW_MONTHLY_LABOUR_SERIES) {
      const fixturePath = fixtureDir ? path.join(fixtureDir, `${series.instrumentCode}.xlsx`) : undefined;
      const points = parseJpMhlwMonthlyLabourWorkbook(
        await fetchJpMhlwMonthlyLabourWorkbook(series.instrumentCode, fixturePath),
        series,
      );
      console.log(
        "source verified",
        series.instrumentCode,
        points.length,
        points[0].obsDate.toISOString().slice(0, 10),
        points.at(-1)!.obsDate.toISOString().slice(0, 10),
      );
    }
  }
  if (!process.argv.includes("--db")) return;
  const prisma = new PrismaClient();
  try {
    for (const series of JP_MHLW_MONTHLY_LABOUR_SERIES) {
      const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: series.instrumentCode } });
      assert.equal(instrument.freqLabel, "月");
      assert.equal(instrument.unit, "指数（2020=100）");
      const metadata = instrument.metadata as Record<string, unknown>;
      assert.equal(metadata.countryCode, "JP");
      assert.equal(metadata.catalogCategory, "劳动力市场");
      assert.equal((metadata.scrape as { provider: string }).provider, JP_MHLW_MONTHLY_LABOUR_PROVIDER);
      assert.equal((metadata.fetchAcquisition as { status: string }).status, "known");
      const subscription = await prisma.dataSubscription.findUniqueOrThrow({
        where: { instrumentId: instrument.id },
        include: { releasePackage: true },
      });
      assert(subscription.enabled);
      assert(subscription.nextRunAt);
      assert.equal((subscription.releaseRule as { type: string }).type, "probe_interval");
      assert.equal((subscription.releaseRule as { intervalHours: number }).intervalHours, 24);
      assert.equal(subscription.releasePackage?.id, JP_MHLW_MONTHLY_LABOUR_PACKAGE_ID);
      const observations = await prisma.macroObservation.findMany({
        where: { instrumentId: instrument.id },
        orderBy: { obsDate: "asc" },
      });
      assert(observations.length >= 430);
      assert.equal(observations[0].obsDate.toISOString().slice(0, 10), "1990-01-01");
      assert(Date.now() - observations.at(-1)!.obsDate.getTime() < 180 * 86_400_000, "source stale");
      assert(observations.every((point) => point.value > 0 && point.value < 1_000));
      for (let index = 1; index < observations.length; index++) {
        const previous = observations[index - 1].obsDate;
        assert.equal(
          observations[index].obsDate.getTime(),
          Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 1),
        );
      }
      console.log(
        "db verified",
        series.instrumentCode,
        observations.length,
        observations.at(-1)!.obsDate.toISOString().slice(0, 10),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "MHLW monthly labour verify failed");
  process.exitCode = 1;
});
