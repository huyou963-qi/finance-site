/**
 * 生成一眼可读的进度看板（队列完成度 + 已搜集事件明细）。
 *
 * Usage:
 *   npm run events:ingest-dashboard
 *
 * 输出：.data/market-event-ingest-progress.md
 */
import {
  INGEST_PROGRESS_PATH,
  progressSummary,
  writeProgressDashboard,
} from "../src/lib/data/eventIngestProgress";
import { INGEST_QUEUE_PATH } from "../src/lib/data/eventIngestQueue";

function main() {
  const out = writeProgressDashboard();
  console.log(
    JSON.stringify(
      {
        written: out.replace(/\\/g, "/"),
        queue: INGEST_QUEUE_PATH.replace(/\\/g, "/"),
        ...progressSummary(),
        progressPath: INGEST_PROGRESS_PATH.replace(/\\/g, "/"),
      },
      null,
      2,
    ),
  );
}

main();
