/**
 * 一键更新所有未更新（nextRunAt 已过期且 acquisition ready）的指标
 *
 * npm run data:sync-all-stale
 * npm run data:sync-all-stale -- --dry-run --limit=50
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { syncAllStaleSubscriptions } from "../../src/lib/data/scheduler/syncAllStale";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argValue(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${prefix}=`));
  return hit?.split("=").slice(1).join("=");
}

async function main() {
  const dryRun = argFlag("dry-run");
  const limit = Number(argValue("limit") ?? "100");

  console.log(`[data:sync-all-stale] ${dryRun ? "dry-run " : ""}limit=${limit}`);
  const result = await syncAllStaleSubscriptions(prisma, { limit, dryRun });

  console.log(
    `[data:sync-all-stale] 未更新 ${result.totalStale} 条；成功 ${result.success}，失败 ${result.failed}，仍过期 ${result.stillStale}`,
  );
  for (const d of result.details.slice(0, 30)) {
    const err = d.error ? ` · ${d.error}` : "";
    console.log(`  ${d.instrumentCode} ${d.status} +${d.rowsUpserted}${err}`);
  }
  if (result.failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
