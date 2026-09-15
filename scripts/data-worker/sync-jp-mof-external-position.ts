import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchJpMofExternalPositionIncremental } from "../../src/lib/data/scheduler/adapters/jpMofExternalPositionAdapter";
import { JP_MOF_EXTERNAL_POSITION_PROVIDER, JP_MOF_EXTERNAL_POSITION_SERIES } from "../../src/lib/data/scheduler/jpMofExternalPosition/catalog";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const iipFixturePath = process.argv.find((argument) => argument.startsWith("--iip-fixture="))?.slice(14);
  const debtFixturePath = process.argv.find((argument) => argument.startsWith("--debt-fixture="))?.slice(15);
  for (const series of JP_MOF_EXTERNAL_POSITION_SERIES) {
    if (!iipFixturePath && !debtFixturePath) {
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
    if (!iipFixturePath || !debtFixturePath) throw new Error("Both --iip-fixture and --debt-fixture are required");
    const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: series.instrumentCode } });
    const result = await fetchJpMofExternalPositionIncremental({ scrape: { provider: JP_MOF_EXTERNAL_POSITION_PROVIDER, iipFixturePath, debtFixturePath } }, series.instrumentCode, "2015-03-01");
    const outcome = await upsertMacroObservations(prisma, instrument.id, result.points, { vintageSource: "jp_mof_external_position_backfill" });
    console.log(series.instrumentCode, result.points.length, outcome);
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "MOF external position sync failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
