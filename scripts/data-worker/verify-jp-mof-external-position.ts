import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchJpMofExternalPositionFiles } from "../../src/lib/data/scheduler/jpMofExternalPosition/client";
import { JP_MOF_EXTERNAL_POSITION_PACKAGE_ID, JP_MOF_EXTERNAL_POSITION_PROVIDER, JP_MOF_EXTERNAL_POSITION_SERIES } from "../../src/lib/data/scheduler/jpMofExternalPosition/catalog";
import { parseJpMofExternalPositionFiles } from "../../src/lib/data/scheduler/jpMofExternalPosition/parser";

loadEnvConfig(process.cwd());
async function main() {
  if (process.argv.includes("--live")) {
    const parsed = parseJpMofExternalPositionFiles(await fetchJpMofExternalPositionFiles());
    for (const [code, points] of Object.entries(parsed)) console.log(code, points.length, points[0], points.at(-1));
  }
  if (!process.argv.includes("--db")) return;
  const prisma = new PrismaClient();
  try {
    for (const series of JP_MOF_EXTERNAL_POSITION_SERIES) {
      const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: series.instrumentCode } });
      const metadata = instrument.metadata as Record<string, unknown>;
      assert.equal(metadata.countryCode, "JP");
      assert.equal(metadata.catalogSubcategory, "国际投资头寸");
      assert.equal((metadata.scrape as { provider: string }).provider, JP_MOF_EXTERNAL_POSITION_PROVIDER);
      const subscription = await prisma.dataSubscription.findUniqueOrThrow({ where: { instrumentId: instrument.id }, include: { releasePackage: true } });
      assert(subscription.enabled && subscription.lastSuccessAt && subscription.nextRunAt);
      assert.equal(subscription.lastError, null);
      assert.equal(subscription.sourceId, "jp-mof-external-position");
      assert.equal(subscription.releasePackage?.id, JP_MOF_EXTERNAL_POSITION_PACKAGE_ID);
      const stats = await prisma.macroObservation.aggregate({ where: { instrumentId: instrument.id }, _count: true, _min: { obsDate: true }, _max: { obsDate: true } });
      assert(stats._count >= 40);
      assert.equal(stats._min.obsDate?.toISOString().slice(0, 10), "2015-03-01");
      assert(Date.now() - stats._max.obsDate!.getTime() < 180 * 86_400_000, "source stale");
      console.log("verified", series.instrumentCode, stats._count, stats._min.obsDate?.toISOString().slice(0, 10), stats._max.obsDate?.toISOString().slice(0, 10));
    }
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "MOF external position verify failed"); process.exitCode = 1; });
