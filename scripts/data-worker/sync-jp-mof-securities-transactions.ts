import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchJpMofSecuritiesTransactionsIncremental } from "../../src/lib/data/scheduler/adapters/jpMofSecuritiesTransactionsAdapter";
import { JP_MOF_SECURITIES_PROVIDER, JP_MOF_SECURITIES_SERIES } from "../../src/lib/data/scheduler/jpMofSecuritiesTransactions/catalog";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const fixturePath = process.argv.find((argument) => argument.startsWith("--fixture="))?.slice(10);
  for (const series of JP_MOF_SECURITIES_SERIES) {
    if (!fixturePath) {
      const subscription = await prisma.dataSubscription.findFirst({
        where: { instrument: { code: series.instrumentCode } },
        include: { source: true, instrument: { select: { id: true, code: true, name: true, metadata: true } }, releasePackage: { select: { id: true, labelZh: true, releaseTemplate: true, scheduleState: true, nextRunAt: true } } },
      });
      if (!subscription) throw new Error(`Seed first: ${series.instrumentCode}`);
      const result = await runDataSubscription(prisma, subscription, { force: true });
      console.log(series.instrumentCode, result);
      if (result.status === "failed" || result.status === "partial") throw new Error(`Worker failed: ${series.instrumentCode}`);
      continue;
    }
    const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: series.instrumentCode } });
    const result = await fetchJpMofSecuritiesTransactionsIncremental({ scrape: { provider: JP_MOF_SECURITIES_PROVIDER, fixturePath } }, series.instrumentCode, "2005-01-01");
    const outcome = await upsertMacroObservations(prisma, instrument.id, result.points, { vintageSource: "jp_mof_securities_backfill" });
    console.log(series.instrumentCode, result.points.length, outcome);
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "MOF securities sync failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
