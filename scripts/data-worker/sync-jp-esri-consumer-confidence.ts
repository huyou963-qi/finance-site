import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchJpEsriConsumerConfidenceIncremental } from "../../src/lib/data/scheduler/adapters/jpEsriConsumerConfidenceAdapter";
import {
  JP_ESRI_CONSUMER_CONFIDENCE_PROVIDER,
  JP_ESRI_CONSUMER_CONFIDENCE_SERIES,
} from "../../src/lib/data/scheduler/jpEsriConsumerConfidence/catalog";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const fixture = process.argv.find((arg) => arg.startsWith("--fixture="))?.slice(10);
  for (const series of JP_ESRI_CONSUMER_CONFIDENCE_SERIES) {
    const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: series.instrumentCode } });
    // The legacy Japan Overview import stored this reused headline code at
    // month-end. Canonical scheduler observations use period-start dates; keep
    // the old evidence in the append-only vintage ledger but remove duplicate
    // month-end rows from the current-value table before the official takeover.
    if (series.instrumentCode === "jpov_c15_consumer_conf_sa") {
      const datedRows = await prisma.macroObservation.findMany({
        where: { instrumentId: instrument.id },
        select: { id: true, obsDate: true },
      });
      const obsoleteIds = datedRows
        .filter((row) => row.obsDate.getUTCDate() !== 1)
        .map((row) => row.id);
      if (obsoleteIds.length) {
        await prisma.macroObservation.deleteMany({ where: { id: { in: obsoleteIds } } });
        console.log(series.instrumentCode, `removed legacy month-end rows=${obsoleteIds.length}`);
      }
    }
    if (!fixture) {
      const subscription = await prisma.dataSubscription.findFirst({
        where: { instrumentId: instrument.id },
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
    const result = await fetchJpEsriConsumerConfidenceIncremental(
      { scrape: { provider: JP_ESRI_CONSUMER_CONFIDENCE_PROVIDER, fixturePath: fixture } },
      series.instrumentCode,
      "1982-06-01",
    );
    const outcome = await upsertMacroObservations(prisma, instrument.id, result.points, {
      vintageSource: "jp_esri_consumer_conf_backfill",
    });
    console.log(series.instrumentCode, result.points.length, outcome);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "ESRI consumer confidence sync failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
