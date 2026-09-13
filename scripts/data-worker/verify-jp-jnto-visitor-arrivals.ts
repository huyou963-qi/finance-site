import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  JP_JNTO_VISITOR_ARRIVALS_HISTORY_START,
  JP_JNTO_VISITOR_ARRIVALS_PACKAGE_ID,
  JP_JNTO_VISITOR_ARRIVALS_PROVIDER,
  JP_JNTO_VISITOR_ARRIVALS_SERIES,
} from "../../src/lib/data/scheduler/jpJntoVisitorArrivals/catalog";
import { fetchJpJntoVisitorArrivalsWorkbook } from "../../src/lib/data/scheduler/jpJntoVisitorArrivals/client";
import { parseJpJntoVisitorArrivalsWorkbook } from "../../src/lib/data/scheduler/jpJntoVisitorArrivals/parser";

loadEnvConfig(process.cwd());

async function main() {
  const fixture = process.argv.find((arg) => arg.startsWith("--fixture="))?.slice(10);
  if (fixture || process.argv.includes("--live")) {
    const parsed = parseJpJntoVisitorArrivalsWorkbook(
      await fetchJpJntoVisitorArrivalsWorkbook(fixture),
    );
    for (const [code, points] of Object.entries(parsed.series)) {
      console.log(code, points.length, points[0], points.at(-1));
    }
  }
  if (!process.argv.includes("--db")) return;

  const prisma = new PrismaClient();
  try {
    for (const series of JP_JNTO_VISITOR_ARRIVALS_SERIES) {
      const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: series.instrumentCode } });
      const metadata = instrument.metadata as Record<string, unknown>;
      assert.equal(metadata.countryCode, "JP");
      assert.equal(metadata.catalogKey, `mds:${series.instrumentCode}`);
      assert.equal(metadata.catalogCategory, "对外与汇率");
      assert.equal(metadata.catalogSubcategory, "入境旅游");
      assert.equal(metadata.seasonalAdjustment, "NSA");
      assert.equal((metadata.scrape as { provider: string }).provider, JP_JNTO_VISITOR_ARRIVALS_PROVIDER);
      assert.equal((metadata.fetchAcquisition as { status: string }).status, "known");

      const subscription = await prisma.dataSubscription.findUniqueOrThrow({
        where: { instrumentId: instrument.id },
        include: { releasePackage: true },
      });
      assert(subscription.enabled);
      assert(subscription.nextRunAt);
      assert.equal(subscription.sourceId, "jp-jnto-visitor-arrivals");
      assert.equal(subscription.revisionLookback, 24);
      assert.equal((subscription.releaseRule as { type: string }).type, "probe_interval");
      assert.equal((subscription.releaseRule as { intervalHours: number }).intervalHours, 24);
      assert.equal(subscription.releasePackage?.id, JP_JNTO_VISITOR_ARRIVALS_PACKAGE_ID);

      const points = await prisma.macroObservation.findMany({
        where: { instrumentId: instrument.id },
        orderBy: { obsDate: "asc" },
      });
      assert(points.length >= 280);
      assert.equal(points[0].obsDate.toISOString().slice(0, 10), JP_JNTO_VISITOR_ARRIVALS_HISTORY_START);
      assert(Date.now() - points.at(-1)!.obsDate.getTime() < 120 * 86_400_000, "source stale");
      assert(points.every((point) => Number.isInteger(point.value) && point.value >= 0));
      const vintages = await prisma.macroObservationVintage.count({ where: { instrumentId: instrument.id } });
      assert(vintages >= points.length, `vintage coverage ${vintages}/${points.length}`);
      console.log(
        "verified",
        series.instrumentCode,
        points.length,
        points[0].obsDate.toISOString().slice(0, 10),
        points.at(-1)!.obsDate.toISOString().slice(0, 10),
        points.at(-1)!.value,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "JNTO visitor arrivals verify failed");
  process.exitCode = 1;
});

