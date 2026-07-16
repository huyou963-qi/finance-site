/**
 * 幂等导入 AI Skill 事件 ingest JSON。
 * 用法: npm run events:import-ingest -- path/to/run.json [--dry-run]
 */
import { resolve } from "node:path";
import {
  importIngestRun,
  loadIngestRunFromFile,
} from "../src/lib/data/marketEventsIngest";

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const dryRun = args.includes("--dry-run");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("用法: npm run events:import-ingest -- <ingest.json> [--dry-run]");
    process.exit(1);
  }
  const run = loadIngestRunFromFile(resolve(file));
  const result = await importIngestRun(run, { dryRun });
  console.log(JSON.stringify({ mode: run.mode, dryRun, ...result }, null, 2));
  if (result.errors.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
