/**
 * 使用流量日聚合 + 明细过期清理
 *
 * npm run analytics:rollup-daily
 * npm run analytics:rollup-daily -- --date=2026-11-23
 * npm run analytics:rollup-daily -- --days=3
 * npm run analytics:rollup-daily -- --no-cleanup
 */
import { loadEnvConfig } from "@next/env";
import {
  cleanupExpiredUsageEvents,
  rollupUsageDay,
} from "../../src/lib/analytics/usageRollup";
import {
  addShanghaiDays,
  shanghaiDateString,
} from "../../src/lib/analytics/usageShanghaiDate";

loadEnvConfig(process.cwd());

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const single = argValue("date");
  const daysRaw = argValue("days");
  const days = daysRaw ? Math.max(0, Number.parseInt(daysRaw, 10) || 0) : 2;
  const skipCleanup = hasFlag("no-cleanup");

  const dates: string[] = [];
  if (single) {
    dates.push(single);
  } else {
    const today = shanghaiDateString();
    for (let i = days; i >= 0; i--) {
      dates.push(addShanghaiDays(today, -i));
    }
  }

  for (const date of dates) {
    const { rows } = await rollupUsageDay(date);
    console.log(`[analytics:rollup] ${date} → ${rows} agg rows`);
  }

  if (!skipCleanup) {
    const deleted = await cleanupExpiredUsageEvents();
    console.log(`[analytics:cleanup] deleted ${deleted} expired usage_event rows`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
