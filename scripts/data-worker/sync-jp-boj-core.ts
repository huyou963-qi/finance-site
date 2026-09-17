import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  JP_BOJ_CORE_SERIES,
  JP_BOJ_FLOW_OF_FUNDS_PACKAGE_ID,
  JP_BOJ_FOF_NEXT_FETCH_AT,
} from "../../src/lib/data/scheduler/bojCore/catalog";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const key = process.argv.find((argument) => argument.startsWith("--series="))?.slice(9);
  const rows = JP_BOJ_CORE_SERIES.filter((row) => !key || row.key === key);
  if (!rows.length) throw new Error(`Unknown Japan BOJ core series: ${key}`);
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
  if (failed) throw new Error(`${failed} Japan BOJ core series failed`);

  // The next official FOF release is known exactly. A forced pre-release
  // backfill would otherwise advance the generic weekly probe beyond it.
  const scheduledFetch = new Date(JP_BOJ_FOF_NEXT_FETCH_AT);
  if (scheduledFetch.getTime() > Date.now() && rows.some((row) => row.db === "FF")) {
    const flowCodes = rows.filter((row) => row.db === "FF").map((row) => row.instrumentCode);
    await prisma.dataSubscription.updateMany({
      where: { instrument: { code: { in: flowCodes } } },
      data: { nextRunAt: scheduledFetch },
    });
    await prisma.releasePackage.update({
      where: { id: JP_BOJ_FLOW_OF_FUNDS_PACKAGE_ID },
      data: { nextRunAt: scheduledFetch },
    });
    console.log(
      JSON.stringify({
        package: JP_BOJ_FLOW_OF_FUNDS_PACKAGE_ID,
        nextRunAt: scheduledFetch.toISOString(),
        basis: "BOJ official release schedule plus API-availability buffer",
      }),
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Japan BOJ core sync failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
