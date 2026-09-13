import assert from "node:assert/strict";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  JP_ESRI_CONSUMER_CONFIDENCE_PACKAGE_ID,
  JP_ESRI_CONSUMER_CONFIDENCE_PROVIDER,
  JP_ESRI_CONSUMER_CONFIDENCE_SERIES,
} from "../../src/lib/data/scheduler/jpEsriConsumerConfidence/catalog";
import { fetchJpEsriConsumerConfidenceWorkbook } from "../../src/lib/data/scheduler/jpEsriConsumerConfidence/client";
import { parseJpEsriConsumerConfidenceWorkbook } from "../../src/lib/data/scheduler/jpEsriConsumerConfidence/parser";

loadEnvConfig(process.cwd());

async function main() {
  const fixture = process.argv.find((arg) => arg.startsWith("--fixture="))?.slice(10);
  if (fixture || process.argv.includes("--live")) {
    const buffer = await fetchJpEsriConsumerConfidenceWorkbook(fixture);
    for (const series of JP_ESRI_CONSUMER_CONFIDENCE_SERIES) {
      const points = parseJpEsriConsumerConfidenceWorkbook(buffer, series);
      console.log(
        "source verified",
        series.instrumentCode,
        points.length,
        points[0]?.obsDate.toISOString().slice(0, 10),
        points.at(-1)?.obsDate.toISOString().slice(0, 10),
      );
    }
  }
  if (!process.argv.includes("--db")) return;
  const prisma = new PrismaClient();
  try {
    for (const series of JP_ESRI_CONSUMER_CONFIDENCE_SERIES) {
      const instrument = await prisma.instrument.findUniqueOrThrow({
        where: { code: series.instrumentCode },
        include: { dataSubscription: { include: { releasePackage: true } } },
      });
      assert.equal(instrument.freqLabel, "月");
      assert.equal(instrument.unit, "指数");
      const metadata = instrument.metadata as Record<string, unknown>;
      assert.equal(metadata.countryCode, "JP");
      assert.equal(metadata.catalogCategory, "国民经济");
      assert.equal(metadata.catalogSubgroup, "消费者信心");
      assert.equal((metadata.scrape as { provider: string }).provider, JP_ESRI_CONSUMER_CONFIDENCE_PROVIDER);
      assert.equal((metadata.fetchAcquisition as { status: string }).status, "known");
      const subscription = instrument.dataSubscription;
      assert(subscription?.enabled);
      assert(subscription.nextRunAt);
      assert.equal(subscription.releasePackage?.id, JP_ESRI_CONSUMER_CONFIDENCE_PACKAGE_ID);
      const observations = await prisma.macroObservation.findMany({
        where: { instrumentId: instrument.id },
        orderBy: { obsDate: "asc" },
      });
      assert.equal(observations.length, 357);
      assert.equal(observations[0]?.obsDate.toISOString().slice(0, 10), "1982-06-01");
      assert(Date.now() - observations.at(-1)!.obsDate.getTime() < 120 * 86_400_000, "source stale");
      assert(observations.every((point) => point.value >= 0 && point.value <= 100));
      assert(observations.every((point) => point.obsDate.getUTCDate() === 1));
      console.log(
        "db verified",
        series.instrumentCode,
        observations.length,
        observations.at(-1)?.obsDate.toISOString().slice(0, 10),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "ESRI consumer confidence verify failed");
  process.exitCode = 1;
});
