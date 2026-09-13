import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchJpMetiRetailIncremental } from "../../src/lib/data/scheduler/adapters/jpMetiRetailAdapter";
import { JP_METI_RETAIL_PROVIDER, JP_METI_RETAIL_SERIES } from "../../src/lib/data/scheduler/jpMetiRetail/catalog";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const fixturePath = process.argv.find((arg) => arg.startsWith("--fixture="))?.slice(10);
  for (const series of JP_METI_RETAIL_SERIES) {
    if (!fixturePath) {
      const subscription = await prisma.dataSubscription.findFirst({
        where: { instrument: { code: series.instrumentCode } },
        include: {
          source: true,
          instrument: { select: { id: true, code: true, name: true, metadata: true } },
          releasePackage: {
            select: { id: true, labelZh: true, releaseTemplate: true, scheduleState: true, nextRunAt: true },
          },
        },
      });
      if (!subscription) throw new Error(`Seed first: ${series.instrumentCode}`);
      const result = await runDataSubscription(prisma, subscription, { force: true });
      console.log(series.instrumentCode, result);
      if (result.status === "failed" || result.status === "partial") {
        throw new Error(`Worker failed: ${series.instrumentCode}`);
      }
      continue;
    }
    const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: series.instrumentCode } });
    const result = await fetchJpMetiRetailIncremental(
      { scrape: { provider: JP_METI_RETAIL_PROVIDER, fixturePath } },
      series.instrumentCode,
      series.historyStart,
    );
    const outcome = await upsertMacroObservations(prisma, instrument.id, result.points, {
      vintageSource: "jp_meti_retail_backfill",
    });
    console.log(series.instrumentCode, result.points.length, outcome);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "METI commerce sync failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
