import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { EUROPE_CORE_SERIES } from "../../src/lib/data/scheduler/europeCore/catalog";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const requested = process.argv.find((arg) => arg.startsWith("--series="))?.slice(9);
  const rows = EUROPE_CORE_SERIES.filter((series) => !requested || series.instrumentCode === requested);
  if (!rows.length) throw new Error(`Unknown Europe core series: ${requested}`);
  let failed = 0;
  for (const row of rows) {
    const subscription = await prisma.dataSubscription.findFirst({
      where: { instrument: { code: row.instrumentCode } },
      include: {
        source: true,
        instrument: { select: { id: true, code: true, name: true, metadata: true } },
        releasePackage: { select: { id: true, labelZh: true, releaseTemplate: true, scheduleState: true, nextRunAt: true } },
      },
    });
    if (!subscription) throw new Error(`Seed first: ${row.instrumentCode}`);
    const result = await runDataSubscription(prisma, subscription, { force: true });
    console.log(JSON.stringify({ code: row.instrumentCode, ...result }));
    if (result.status === "failed" || result.status === "partial") failed += 1;
  }
  if (failed) throw new Error(`${failed} Europe core series failed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
