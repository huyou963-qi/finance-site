import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchJpTourismCoreIncremental } from "../../src/lib/data/scheduler/adapters/jpTourismCoreAdapter";
import { JP_TOURISM_CORE_PROVIDER, JP_TOURISM_CORE_SERIES } from "../../src/lib/data/scheduler/jpTourismCore/catalog";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  const fixtureDir = process.argv.find((arg) => arg.startsWith("--fixture-dir="))?.slice(14);
  for (const series of JP_TOURISM_CORE_SERIES) {
    if (!fixtureDir) {
      const subscription = await prisma.dataSubscription.findFirstOrThrow({ where: { instrument: { code: series.instrumentCode } }, include: { source: true, instrument: { select: { id: true, code: true, name: true, metadata: true } }, releasePackage: { select: { id: true, labelZh: true, releaseTemplate: true, scheduleState: true, nextRunAt: true } } } });
      const result = await runDataSubscription(prisma, subscription, { force: true });
      if (result.status === "failed" || result.status === "partial") throw new Error(`worker failed: ${series.instrumentCode}`);
      console.log(series.instrumentCode, result);
      continue;
    }
    const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: series.instrumentCode } });
    const result = await fetchJpTourismCoreIncremental({ scrape: { provider: JP_TOURISM_CORE_PROVIDER, fixtureDir } }, series.instrumentCode, "1950-01-01");
    console.log(series.instrumentCode, result.points.length, await upsertMacroObservations(prisma, instrument.id, result.points, { vintageSource: "jp_jta_tourism_backfill" }));
  }
}
const keepAlive = setInterval(() => undefined, 1_000);
void main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); clearInterval(keepAlive); });
