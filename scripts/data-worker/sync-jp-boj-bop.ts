import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { JP_BOJ_BOP_SERIES } from "../../src/lib/data/scheduler/bojExternal/catalog";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const key = process.argv.find((argument) => argument.startsWith("--series="))?.slice(9);
  const rows = JP_BOJ_BOP_SERIES.filter((row) => !key || row.key === key);
  if (!rows.length) throw new Error(`Unknown Japan BOJ BOP series: ${key}`);
  let failed = 0;
  for (const row of rows) {
    const subscription = await prisma.dataSubscription.findFirst({
      where: { instrument: { code: row.instrumentCode } },
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
    if (!subscription) throw new Error(`Seed first: ${row.instrumentCode}`);
    const result = await runDataSubscription(prisma, subscription, { force: true });
    console.log(JSON.stringify({ code: row.instrumentCode, ...result }));
    if (result.status === "failed" || result.status === "partial") failed++;
  }
  if (failed) throw new Error(`${failed} Japan BOJ BOP series failed`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Japan BOJ BOP sync failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
