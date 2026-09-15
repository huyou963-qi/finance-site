import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { decodeJpMofSecuritiesCsv, fetchJpMofSecuritiesCsv } from "../../src/lib/data/scheduler/jpMofSecuritiesTransactions/client";
import { JP_MOF_SECURITIES_PACKAGE_ID, JP_MOF_SECURITIES_PROVIDER, JP_MOF_SECURITIES_SERIES } from "../../src/lib/data/scheduler/jpMofSecuritiesTransactions/catalog";
import { parseJpMofSecuritiesCsv } from "../../src/lib/data/scheduler/jpMofSecuritiesTransactions/parser";

loadEnvConfig(process.cwd());
async function main() {
  const fixture = process.argv.find((argument) => argument.startsWith("--fixture="))?.slice(10);
  if (fixture || process.argv.includes("--live")) {
    const parsed = parseJpMofSecuritiesCsv(decodeJpMofSecuritiesCsv(await fetchJpMofSecuritiesCsv(fixture)), fixture ? 2 : 250);
    for (const [code, points] of Object.entries(parsed)) console.log(code, points.length, points[0], points.at(-1));
  }
  if (!process.argv.includes("--db")) return;
  const prisma = new PrismaClient();
  try {
    for (const series of JP_MOF_SECURITIES_SERIES) {
      const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: series.instrumentCode } });
      const metadata = instrument.metadata as Record<string, unknown>;
      assert.equal(metadata.countryCode, "JP");
      assert.equal(metadata.catalogSubcategory, "跨境证券投资");
      assert.equal(metadata.signConvention, "net_acquisition_positive");
      assert.equal((metadata.scrape as { provider: string }).provider, JP_MOF_SECURITIES_PROVIDER);
      const subscription = await prisma.dataSubscription.findUniqueOrThrow({ where: { instrumentId: instrument.id }, include: { releasePackage: true } });
      assert(subscription.enabled && subscription.lastSuccessAt && subscription.nextRunAt);
      assert.equal(subscription.lastError, null);
      assert.equal(subscription.sourceId, "jp-mof-securities-transactions");
      assert.equal(subscription.releasePackage?.id, JP_MOF_SECURITIES_PACKAGE_ID);
      const stats = await prisma.macroObservation.aggregate({ where: { instrumentId: instrument.id }, _count: true, _min: { obsDate: true }, _max: { obsDate: true } });
      assert(stats._count >= 250);
      assert.equal(stats._min.obsDate?.toISOString().slice(0, 10), "2005-01-01");
      assert(Date.now() - stats._max.obsDate!.getTime() < 90 * 86_400_000, "source stale");
      console.log("verified", series.instrumentCode, stats._count, stats._min.obsDate?.toISOString().slice(0, 10), stats._max.obsDate?.toISOString().slice(0, 10));
    }
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "MOF securities verify failed"); process.exitCode = 1; });
