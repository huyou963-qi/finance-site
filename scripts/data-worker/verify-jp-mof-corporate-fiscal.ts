import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { JP_MOF_CORPORATE_FISCAL_PROVIDER, JP_MOF_CORPORATE_FISCAL_SERIES } from "../../src/lib/data/scheduler/jpMofCorporateFiscal/catalog";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  assert.equal(JP_MOF_CORPORATE_FISCAL_SERIES.length, 12);
  if (!process.argv.includes("--db")) return;
  for (const series of JP_MOF_CORPORATE_FISCAL_SERIES) {
    const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: series.instrumentCode } });
    const metadata = instrument.metadata as { countryCode?: string; scrape?: { provider?: string } };
    assert.equal(metadata.countryCode, "JP"); assert.equal(metadata.scrape?.provider, JP_MOF_CORPORATE_FISCAL_PROVIDER);
    const subscription = await prisma.dataSubscription.findUniqueOrThrow({ where: { instrumentId: instrument.id }, include: { releasePackage: true } });
    assert(subscription.enabled && subscription.lastSuccessAt && subscription.nextRunAt); assert.equal(subscription.lastError, null);
    const stats = await prisma.macroObservation.aggregate({ where: { instrumentId: instrument.id }, _count: true, _min: { obsDate: true }, _max: { obsDate: true } });
    assert(stats._count > 10, `${series.instrumentCode} needs observations`);
    console.log("verified", series.instrumentCode, stats._count, stats._min.obsDate?.toISOString().slice(0, 10), stats._max.obsDate?.toISOString().slice(0, 10));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
