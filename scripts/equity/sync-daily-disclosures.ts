/** Daily end-of-day SEC ingest; no polling. See docs/US_EQUITY_DAILY_DISCLOSURES.md. */
import { Client } from "pg";
import { prisma } from "../../src/lib/prisma";
import { syncDailyDisclosures } from "../../src/lib/equity/dailyDisclosures";
import { runRecordedDisclosureBatch } from "../../src/lib/equity/disclosureBatchRunner";

function arg(name: string) {
  return process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const options = {
    through: arg("through"), days: Number(arg("days") ?? 7),
    symbols: arg("symbols")?.split(",").map(symbol => symbol.trim().toUpperCase()).filter(Boolean),
    maxFilings: Number(arg("max-filings") ?? 300), delayMs: Number(arg("delay-ms") ?? 1000), dryRun,
    timingLimit: Number(arg("timing-limit") ?? 20),
  };
  if (dryRun) {
    console.log(JSON.stringify(await syncDailyDisclosures(options), null, 2));
    return;
  }
  // Session-level lock needs a dedicated connection, not Prisma's pooled connection.
  const lock = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15_000 });
  await lock.connect();
  try {
    const acquired = await lock.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(726310251) AS locked");
    if (!acquired.rows[0].locked) throw new Error("已有每日公告批次运行，本次跳过");
    const result = await runRecordedDisclosureBatch(options);
    console.log(JSON.stringify(result, null, 2));
    if (result.failed) process.exitCode = 1;
  } finally {
    await lock.end();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
