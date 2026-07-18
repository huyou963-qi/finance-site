/**
 * 领取下一条 pending 任务（标为 running），打印给 Agent 执行。
 *
 * Usage:
 *   npm run events:ingest-next
 *   npm run events:ingest-next -- --modes=policy,macro-event
 *   npm run events:ingest-next -- --peek          # 不改状态
 *   npm run events:ingest-next -- --done=<id> --output=.data/ingest/....json
 *   npm run events:ingest-next -- --blocked=<id> --note="no sources"
 *   npm run events:ingest-next -- --stats
 */
import { loadEnvConfig } from "@next/env";
import {
  appendIngestRecord,
  claimNextPending,
  coverageByModeYear,
  loadQueue,
  markTaskStatus,
  queueStats,
  saveQueue,
} from "../src/lib/data/eventIngestQueue";
import { writeProgressDashboard } from "../src/lib/data/eventIngestProgress";

loadEnvConfig(process.cwd());

function argValue(flag: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function main() {
  const queue = loadQueue();

  if (hasFlag("--stats")) {
    const stats = queueStats(queue);
    const cov = coverageByModeYear(queue).filter((r) => r.total > 0).slice(0, 40);
    const progress = writeProgressDashboard(queue);
    console.log(JSON.stringify({ stats, coverageSample: cov, window: {
      from: queue.windowFrom,
      to: queue.windowTo,
    }, progress }, null, 2));
    return;
  }

  const doneId = argValue("--done");
  if (doneId) {
    const task = markTaskStatus(queue, doneId, "done", {
      outputFile: argValue("--output") ?? undefined,
      notes: argValue("--note") ?? undefined,
    });
    if (!task) {
      console.error(`Task not found: ${doneId}`);
      process.exitCode = 1;
      return;
    }
    saveQueue(queue);
    const runAt = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).slice(0, 10);
    appendIngestRecord([
      runAt,
      task.mode,
      (task.query.assets ?? (task.query.symbol ? [task.query.symbol] : [])).join(", ") || "-",
      (task.query.tags ?? []).join(", ") || "-",
      (task.query.industries ?? []).join(", ") || "-",
      task.mode,
      `${task.query.from} → ${task.query.to}`,
      task.outputFile ?? "-",
      "done",
    ]);
    const progress = writeProgressDashboard(queue);
    console.log(JSON.stringify({ marked: "done", task, progress }, null, 2));
    return;
  }

  const blockedId = argValue("--blocked");
  if (blockedId) {
    const task = markTaskStatus(queue, blockedId, "blocked", {
      notes: argValue("--note") ?? "blocked",
    });
    if (!task) {
      console.error(`Task not found: ${blockedId}`);
      process.exitCode = 1;
      return;
    }
    saveQueue(queue);
    console.log(JSON.stringify({ marked: "blocked", task }, null, 2));
    return;
  }

  const modes = argValue("--modes")?.split(",").map((s) => s.trim()).filter(Boolean);
  const maxPriority = argValue("--max-priority")
    ? Number(argValue("--max-priority"))
    : undefined;

  if (hasFlag("--peek")) {
    const pending = queue.tasks.find((t) => {
      if (t.status !== "pending") return false;
      if (modes && !modes.includes(t.mode)) return false;
      if (maxPriority != null && t.priority > maxPriority) return false;
      return true;
    });
    console.log(JSON.stringify({ peek: true, task: pending ?? null, stats: queueStats(queue) }, null, 2));
    return;
  }

  const task = claimNextPending(queue, { modes, maxPriority });
  if (!task) {
    console.log(JSON.stringify({ task: null, stats: queueStats(queue), message: "no pending tasks" }, null, 2));
    return;
  }
  saveQueue(queue);

  console.log(
    JSON.stringify(
      {
        task,
        agentInstructions: {
          skill: "market-event-ingest",
          steps: [
            task.query.symbol
              ? `GET /api/equity/stocks/${task.query.symbol}/events (SEC exclude)`
              : null,
            `GET /api/events?from=${task.query.from}&to=${task.query.to}&limit=2000`,
            "WebSearch/WebFetch ≥2 sources; no fabrication",
            `Write JSON → ${task.outputFile}`,
            `npm run events:validate-ingest -- ${task.outputFile}`,
            `npm run events:import-ingest -- ${task.outputFile}`,
            "（连续批跑：校验通过即正式入库，无需等确认；出问题用 --blocked）",
            `npm run events:ingest-next -- --done=${task.id} --output=${task.outputFile}`,
            "然后立即 events:ingest-next 领取下一格",
          ].filter(Boolean),
        },
        stats: queueStats(queue),
      },
      null,
      2,
    ),
  );
}

main();
