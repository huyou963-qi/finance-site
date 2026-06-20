/**
 * 从 JSON 种子文件批量导入市场事件到 PostgreSQL（market_event 表）。
 *
 * 种子格式见 `.cursor/prompts/market-events-us-history-timeline.md`
 *
 * Usage:
 *   npm run data:build-us-history-timeline
 *   npm run db:seed-market-events -- scripts/data/market-events-us-history-timeline.json
 */
import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import {
  importMarketEventsFromSeed,
  parseMarketEventSeedFile,
} from "../src/lib/data/marketEventsImport";
import { prisma } from "../src/lib/prisma";

loadEnvConfig(process.cwd());

function parseArgs(argv: string[]) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const positional = argv.filter((a) => !a.startsWith("--"));
  return {
    file:
      positional[0] ??
      path.join(process.cwd(), "scripts/data/market-events-us-history-timeline.json"),
    dryRun: flags.has("--dry-run"),
    force: flags.has("--force"),
  };
}

async function main() {
  const { file, dryRun, force } = parseArgs(process.argv.slice(2));
  const abs = path.resolve(file);

  const raw = JSON.parse(await fs.readFile(abs, "utf8"));
  const seed = parseMarketEventSeedFile(raw);

  console.log(`[seed-market-events] file=${abs}`);
  console.log(`[seed-market-events] events=${seed.events.length} dryRun=${dryRun} skipExisting=${!force}`);
  if (seed.description) console.log(`[seed-market-events] ${seed.description}`);

  const result = await importMarketEventsFromSeed(seed, {
    dryRun,
    skipExisting: !force,
  });

  console.log(
    `[seed-market-events] done: created=${result.created} skipped=${result.skipped} errors=${result.errors.length}`,
  );

  if (result.errors.length) {
    for (const err of result.errors) {
      console.error(
        `  [${err.index}] ${err.title ?? "(无标题)"}: ${err.message}`,
      );
    }
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
