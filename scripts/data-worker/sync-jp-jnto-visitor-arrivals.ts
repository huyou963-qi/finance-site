import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchJpJntoVisitorArrivalsIncremental } from "../../src/lib/data/scheduler/adapters/jpJntoVisitorArrivalsAdapter";
import {
  JP_JNTO_VISITOR_ARRIVALS_PROVIDER,
  JP_JNTO_VISITOR_ARRIVALS_SERIES,
} from "../../src/lib/data/scheduler/jpJntoVisitorArrivals/catalog";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const fixturePath = process.argv.find((arg) => arg.startsWith("--fixture="))?.slice(10);
  for (const series of JP_JNTO_VISITOR_ARRIVALS_SERIES) {
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
    const result = await fetchJpJntoVisitorArrivalsIncremental(
      { scrape: { provider: JP_JNTO_VISITOR_ARRIVALS_PROVIDER, fixturePath } },
      series.instrumentCode,
      "1950-01-01",
    );
    const outcome = await upsertMacroObservations(prisma, instrument.id, result.points, {
      vintageSource: "jp_jnto_arrivals_backfill",
    });
    console.log(series.instrumentCode, result.points.length, outcome);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "JNTO visitor arrivals sync failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

