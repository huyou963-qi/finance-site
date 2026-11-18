import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";
import { fetchFredIncremental } from "../../src/lib/data/scheduler/adapters/fredAdapter";
import { CONSUMER_STRUCTURE_SERIES } from "../../src/lib/data/scheduler/consumerStructureCatalog";
loadEnvConfig(process.cwd());
const db = new PrismaClient();
async function main() {
  if (!process.env.FRED_API_KEY) throw new Error("FRED_API_KEY is required");
  for (const row of CONSUMER_STRUCTURE_SERIES) {
    const sub = await db.dataSubscription.findFirstOrThrow({ where: { instrument: { fredSeriesId: row.fredId } },
      include: { source: true, instrument: true, releasePackage: true } });
    const result = await runDataSubscription(db, sub, { force: true, skipCalendarRefresh: true, preserveNextRunAt: true,
      fetchIncremental: () => fetchFredIncremental(row.fredId, process.env.FRED_API_KEY!, "1959-01-01", undefined, true, true) });
    console.log(`[sync-consumer-structure] ${row.fredId} ${JSON.stringify(result)}`);
    if (result.status === "failed" || !result.latestObsDate) throw new Error(`Sync incomplete: ${row.fredId}`);
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
