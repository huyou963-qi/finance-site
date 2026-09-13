import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  JP_MOF_RESERVES_PACKAGE_ID,
  JP_MOF_RESERVES_PROVIDER,
  JP_MOF_RESERVES_SERIES,
} from "../../src/lib/data/scheduler/jpMofReserves/catalog";
import { decodeJpMofReservesCsv, fetchJpMofReservesCsv } from "../../src/lib/data/scheduler/jpMofReserves/client";
import { parseJpMofReservesCsv } from "../../src/lib/data/scheduler/jpMofReserves/parser";

loadEnvConfig(process.cwd());

async function main() {
  const fixture = process.argv.find((argument) => argument.startsWith("--fixture="))?.slice(10);
  if (fixture || process.argv.includes("--live")) {
    const parsed = parseJpMofReservesCsv(decodeJpMofReservesCsv(await fetchJpMofReservesCsv(fixture)));
    for (const [code, points] of Object.entries(parsed)) {
      console.log(code, points.length, points[0], points.at(-1));
    }
  }
  if (!process.argv.includes("--db")) return;
  const prisma = new PrismaClient();
  try {
    for (const series of JP_MOF_RESERVES_SERIES) {
      const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: series.instrumentCode } });
      const metadata = instrument.metadata as Record<string, unknown>;
      assert.equal(metadata.countryCode, "JP");
      assert.equal(metadata.catalogKey, `mds:${series.instrumentCode}`);
      assert.equal((metadata.scrape as { provider: string }).provider, JP_MOF_RESERVES_PROVIDER);
      assert.equal((metadata.fetchAcquisition as { status: string }).status, "known");
      assert.equal(metadata.referencePeriod, "month_end");
      const subscription = await prisma.dataSubscription.findUniqueOrThrow({
        where: { instrumentId: instrument.id },
        include: { releasePackage: true },
      });
      assert(subscription.enabled);
      assert(subscription.lastSuccessAt);
      assert(subscription.nextRunAt);
      assert.equal(subscription.lastError, null);
      assert.equal(subscription.sourceId, "jp-mof-reserves");
      assert.equal((subscription.releaseRule as { type: string }).type, "probe_interval");
      assert.equal((subscription.releaseRule as { intervalHours: number }).intervalHours, 24);
      assert.equal(subscription.releasePackage?.id, JP_MOF_RESERVES_PACKAGE_ID);
      const stats = await prisma.macroObservation.aggregate({
        where: { instrumentId: instrument.id },
        _count: true,
        _min: { obsDate: true },
        _max: { obsDate: true },
      });
      const minimum = series.historyStart === "2000-04-01" ? 300 : 200;
      assert(stats._count >= minimum);
      assert.equal(stats._min.obsDate?.toISOString().slice(0, 10), series.historyStart);
      assert(Date.now() - stats._max.obsDate!.getTime() < 120 * 86_400_000, "source stale");
      console.log(
        "verified",
        series.instrumentCode,
        stats._count,
        stats._min.obsDate?.toISOString().slice(0, 10),
        stats._max.obsDate?.toISOString().slice(0, 10),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "MOF reserves verify failed");
  process.exitCode = 1;
});
