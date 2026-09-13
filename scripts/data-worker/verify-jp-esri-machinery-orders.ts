import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  JP_ESRI_MACHINERY_ORDERS_PACKAGE_ID,
  JP_ESRI_MACHINERY_ORDERS_PROVIDER,
  JP_ESRI_MACHINERY_ORDERS_SERIES,
  JP_ESRI_MACHINERY_ORDERS_SOURCE_ID,
} from "../../src/lib/data/scheduler/jpEsriMachineryOrders/catalog";
import { fetchJpEsriMachineryOrdersWorkbook } from "../../src/lib/data/scheduler/jpEsriMachineryOrders/client";
import { parseJpEsriMachineryOrdersWorkbook } from "../../src/lib/data/scheduler/jpEsriMachineryOrders/parser";

loadEnvConfig(process.cwd());

async function main() {
  assert.equal(
    new Set(JP_ESRI_MACHINERY_ORDERS_SERIES.map((series) => series.instrumentCode)).size,
    JP_ESRI_MACHINERY_ORDERS_SERIES.length,
  );
  const fixture = process.argv.find((arg) => arg.startsWith("--fixture="))?.slice(10);
  if (fixture || process.argv.includes("--live")) {
    const buffer = await fetchJpEsriMachineryOrdersWorkbook(fixture);
    for (const series of JP_ESRI_MACHINERY_ORDERS_SERIES) {
      const points = parseJpEsriMachineryOrdersWorkbook(buffer, series);
      console.log(
        "source verified",
        series.instrumentCode,
        points.length,
        points[0]?.obsDate.toISOString().slice(0, 10),
        points.at(-1)?.obsDate.toISOString().slice(0, 10),
        points.at(-1)?.value,
      );
    }
  }
  if (!process.argv.includes("--db")) return;
  const skipPackage = process.argv.includes("--skip-package");
  const prisma = new PrismaClient();
  try {
    for (const series of JP_ESRI_MACHINERY_ORDERS_SERIES) {
      const instrument = await prisma.instrument.findUniqueOrThrow({
        where: { code: series.instrumentCode },
        include: { dataSubscription: { include: { releasePackage: true } } },
      });
      assert.equal(instrument.freqLabel, "月");
      assert.equal(instrument.unit, "百万日元");
      const metadata = instrument.metadata as Record<string, unknown>;
      assert.equal(metadata.countryCode, "JP");
      assert.equal(metadata.catalogCategory, "国民经济");
      assert.equal(metadata.catalogSubgroup, "设备投资与机械订单");
      assert.equal(
        (metadata.scrape as { provider: string }).provider,
        JP_ESRI_MACHINERY_ORDERS_PROVIDER,
      );
      assert.equal((metadata.fetchAcquisition as { status: string }).status, "known");
      const subscription = instrument.dataSubscription;
      assert(subscription?.enabled);
      assert(subscription.nextRunAt);
      assert.equal(subscription.sourceId, JP_ESRI_MACHINERY_ORDERS_SOURCE_ID);
      assert.equal((subscription.releaseRule as { type: string }).type, "probe_interval");
      assert.equal((subscription.releaseRule as { intervalHours: number }).intervalHours, 24);
      if (!skipPackage) {
        assert.equal(subscription.releasePackage?.id, JP_ESRI_MACHINERY_ORDERS_PACKAGE_ID);
      }
      const observations = await prisma.macroObservation.findMany({
        where: { instrumentId: instrument.id },
        orderBy: { obsDate: "asc" },
      });
      assert(observations.length >= 255);
      assert.equal(observations[0]?.obsDate.toISOString().slice(0, 10), "2005-04-01");
      assert(Date.now() - observations.at(-1)!.obsDate.getTime() < 150 * 86_400_000, "source stale");
      assert(observations.every((point) => point.value > 0 && point.value < 100_000_000));
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
  console.error(error instanceof Error ? error.message : "ESRI machinery orders verify failed");
  process.exitCode = 1;
});
