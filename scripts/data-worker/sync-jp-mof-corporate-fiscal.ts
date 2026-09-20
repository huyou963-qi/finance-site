import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { JP_MOF_CORPORATE_FISCAL_SERIES } from "../../src/lib/data/scheduler/jpMofCorporateFiscal/catalog";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  for (const series of JP_MOF_CORPORATE_FISCAL_SERIES) {
    const subscription = await prisma.dataSubscription.findFirstOrThrow({
      where: { instrument: { code: series.instrumentCode } },
      include: { source: true, instrument: { select: { id: true, code: true, name: true, metadata: true } }, releasePackage: { select: { id: true, labelZh: true, releaseTemplate: true, scheduleState: true, nextRunAt: true } } },
    });
    const result = await runDataSubscription(prisma, subscription, { force: true });
    console.log(series.instrumentCode, result);
    if (result.status === "failed" || result.status === "partial") {
      throw new Error(`sync failed: ${series.instrumentCode}`);
    }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
