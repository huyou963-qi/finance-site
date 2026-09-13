import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchJpCaoEconomyWatchersIncremental } from "../../src/lib/data/scheduler/adapters/jpCaoEconomyWatchersAdapter";
import { JP_CAO_WATCHERS_PROVIDER, JP_CAO_WATCHERS_SERIES } from "../../src/lib/data/scheduler/jpCabinetEconomyWatchers/catalog";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const fixturePath = process.argv.find((argument) => argument.startsWith("--fixture="))?.slice(10);
  for (const row of JP_CAO_WATCHERS_SERIES) {
    if (!fixturePath) {
      const subscription = await prisma.dataSubscription.findFirst({
        where: { instrument: { code: row.instrumentCode } },
        include: {
          source: true,
          instrument: { select: { id: true, code: true, name: true, metadata: true } },
          releasePackage: {
            select: { id: true, labelZh: true, releaseTemplate: true, scheduleState: true, nextRunAt: true },
          },
        },
      });
      if (!subscription) throw new Error(`Seed first: ${row.instrumentCode}`);
      const result = await runDataSubscription(prisma, subscription, { force: true });
      console.log(row.instrumentCode, result);
      if (result.status === "failed" || result.status === "partial") {
        throw new Error(`Worker failed: ${row.instrumentCode}`);
      }
      continue;
    }
    const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: row.instrumentCode } });
    const result = await fetchJpCaoEconomyWatchersIncremental(
      { scrape: { provider: JP_CAO_WATCHERS_PROVIDER, fixturePath } },
      row.instrumentCode,
      "2002-01-01",
    );
    const write = await upsertMacroObservations(prisma, instrument.id, result.points, {
      vintageSource: "jp_cao_economy_watchers_backfill",
    });
    console.log(row.instrumentCode, write);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
