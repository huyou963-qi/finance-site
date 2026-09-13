import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchJpEsriMachineryOrdersIncremental } from "../../src/lib/data/scheduler/adapters/jpEsriMachineryOrdersAdapter";
import {
  JP_ESRI_MACHINERY_ORDERS_PROVIDER,
  JP_ESRI_MACHINERY_ORDERS_SERIES,
} from "../../src/lib/data/scheduler/jpEsriMachineryOrders/catalog";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const fixturePath = process.argv.find((arg) => arg.startsWith("--fixture="))?.slice(10);
  const direct = process.argv.includes("--direct") || Boolean(fixturePath);
  for (const series of JP_ESRI_MACHINERY_ORDERS_SERIES) {
    const instrument = await prisma.instrument.findUniqueOrThrow({
      where: { code: series.instrumentCode },
    });
    if (direct) {
      const result = await fetchJpEsriMachineryOrdersIncremental(
        {
          scrape: {
            provider: JP_ESRI_MACHINERY_ORDERS_PROVIDER,
            fixturePath,
          },
        },
        series.instrumentCode,
        "2005-04-01",
      );
      const outcome = await upsertMacroObservations(prisma, instrument.id, result.points, {
        vintageSource: "jp_esri_machinery_orders",
      });
      console.log(series.instrumentCode, result.points.length, outcome);
      continue;
    }
    const subscription = await prisma.dataSubscription.findFirst({
      where: { instrumentId: instrument.id },
      include: {
        source: true,
        instrument: { select: { id: true, code: true, name: true, metadata: true } },
        releasePackage: {
          select: {
            id: true,
            labelZh: true,
            releaseTemplate: true,
            scheduleState: true,
            nextRunAt: true,
          },
        },
      },
    });
    if (!subscription) throw new Error(`Seed first: ${series.instrumentCode}`);
    const result = await runDataSubscription(prisma, subscription, { force: true });
    console.log(series.instrumentCode, result);
    if (result.status === "failed" || result.status === "partial") {
      throw new Error(`Worker failed: ${series.instrumentCode}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "ESRI machinery orders sync failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
