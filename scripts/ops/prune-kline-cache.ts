import { prisma } from "../../src/lib/prisma";
import { postgresKlineCacheStore } from "../../src/lib/data/postgresKlineCacheStore";

async function main() {
  try {
    await postgresKlineCacheStore.prune(Date.now());
    const stats = await prisma.$queryRaw<{ entries: number; payload_bytes: number; active_refreshes: number }[]>`
      SELECT count(*)::int AS entries, coalesce(sum(payload_bytes), 0)::float8 AS payload_bytes,
        count(*) FILTER (WHERE lease_until > now())::int AS active_refreshes
      FROM mds.kline_response_cache`;
    console.log(JSON.stringify(stats[0]));
  } finally { await prisma.$disconnect(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
