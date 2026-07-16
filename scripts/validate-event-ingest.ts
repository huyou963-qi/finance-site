/**
 * 校验 AI Skill 输出的事件 ingest JSON。
 * 用法: npm run events:validate-ingest -- path/to/run.json
 */
import { resolve } from "node:path";
import {
  loadIngestRunFromFile,
  validateIngestRun,
} from "../src/lib/data/marketEventsIngest";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("用法: npm run events:validate-ingest -- <ingest.json>");
    process.exit(1);
  }
  const run = loadIngestRunFromFile(resolve(file));
  const result = validateIngestRun(run);
  console.log(
    JSON.stringify(
      {
        mode: run.mode,
        eventCount: result.eventCount,
        skippedCount: result.skippedCount,
        ok: result.ok,
        issues: result.issues,
      },
      null,
      2,
    ),
  );
  if (!result.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
