import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchJpCustomsTradeIncremental } from "../../src/lib/data/scheduler/adapters/jpCustomsTradeAdapter";
import { JP_CUSTOMS_TRADE_PROVIDER, JP_CUSTOMS_TRADE_SERIES } from "../../src/lib/data/scheduler/jpCustomsTrade/catalog";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const fixturePath = process.argv.find((argument) => argument.startsWith("--fixture="))?.slice(10);
  for (const series of JP_CUSTOMS_TRADE_SERIES) {
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
    const result = await fetchJpCustomsTradeIncremental({ scrape: { provider: JP_CUSTOMS_TRADE_PROVIDER, fixturePath } }, series.instrumentCode, "1979-01-01");
    const outcome = await upsertMacroObservations(prisma, instrument.id, result.points, { vintageSource: "jp_customs_trade_backfill" });
    console.log(series.instrumentCode, result.points.length, outcome);
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Japan Customs trade sync failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
