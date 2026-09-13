import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchJpMetiRetailWorkbook } from "../../src/lib/data/scheduler/jpMetiRetail/client";
import {
  JP_METI_RETAIL_PACKAGE_ID,
  JP_METI_RETAIL_PROVIDER,
  JP_METI_RETAIL_SERIES,
} from "../../src/lib/data/scheduler/jpMetiRetail/catalog";
import { parseJpMetiRetailWorkbook } from "../../src/lib/data/scheduler/jpMetiRetail/parser";

loadEnvConfig(process.cwd());

async function main() {
  const fixture = process.argv.find((arg) => arg.startsWith("--fixture="))?.slice(10);
  if (fixture || process.argv.includes("--live")) {
    const parsed = parseJpMetiRetailWorkbook(await fetchJpMetiRetailWorkbook(fixture));
    for (const [code, points] of Object.entries(parsed)) {
      console.log(code, points.length, points[0], points.at(-1));
    }
  }
  if (!process.argv.includes("--db")) return;
  const prisma = new PrismaClient();
  try {
    for (const series of JP_METI_RETAIL_SERIES) {
      const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: series.instrumentCode } });
      const metadata = instrument.metadata as Record<string, unknown>;
      assert.equal(metadata.countryCode, "JP");
      assert.equal(metadata.catalogKey, `mds:${series.instrumentCode}`);
      assert.equal((metadata.scrape as { provider: string }).provider, JP_METI_RETAIL_PROVIDER);
      assert.equal((metadata.fetchAcquisition as { status: string }).status, "known");
      assert.equal(metadata.seasonalAdjustment, "NSA");
      assert.equal(metadata.priceBasis, "nominal");
      const subscription = await prisma.dataSubscription.findUniqueOrThrow({
        where: { instrumentId: instrument.id },
        include: { releasePackage: true },
      });
      assert(subscription.enabled);
      assert(subscription.nextRunAt);
      assert.equal(subscription.sourceId, "jp-meti-retail");
      assert.equal((subscription.releaseRule as { type: string }).type, "probe_interval");
      assert.equal((subscription.releaseRule as { intervalHours: number }).intervalHours, 72);
      assert.equal(subscription.releasePackage?.id, JP_METI_RETAIL_PACKAGE_ID);
      const points = await prisma.macroObservation.findMany({
        where: { instrumentId: instrument.id },
        orderBy: { obsDate: "asc" },
      });
      const expectedMinimum = series.key === "nonstore" ? 120 : series.key === "medicine_toiletries" || series.key === "other" ? 180 : series.key === "fuel" ? 330 : 540;
      assert(points.length >= expectedMinimum);
      assert.equal(points[0].obsDate.toISOString().slice(0, 10), series.historyStart);
      assert(Date.now() - points.at(-1)!.obsDate.getTime() < 180 * 86_400_000, "source stale");
      assert(points.every((point) => point.value >= 0 && point.value < 1_000_000));
      console.log("verified", series.instrumentCode, points.length, points.at(-1)!.obsDate.toISOString());
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "METI commerce verify failed");
  process.exitCode = 1;
});

