/**
 * 播种 P0/P1 队列格：US macro（policy/macro-event/speech）+ 黄金 + GICS 行业 + 宽基。
 * 主窗默认 2006-01-01 → 今天；按年切片；已完成的黄金 PT 格标为 done。
 *
 * Usage:
 *   npm run events:ingest-seed-p0
 *   npm run events:ingest-seed-p0 -- --window-from=2006-01-01
 */
import { loadEnvConfig } from "@next/env";
import {
  DEFAULT_WINDOW_FROM,
  defaultOutputFile,
  loadQueue,
  saveQueue,
  upsertTasks,
  yearSlices,
  type IngestQueueTask,
} from "../src/lib/data/eventIngestQueue";

loadEnvConfig(process.cwd());

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

const GICS_SECTORS: Array<{ code: string; name: string }> = [
  { code: "10", name: "能源" },
  { code: "15", name: "原材料" },
  { code: "20", name: "工业" },
  { code: "25", name: "可选消费" },
  { code: "30", name: "必选消费" },
  { code: "35", name: "医疗保健" },
  { code: "40", name: "金融" },
  { code: "45", name: "信息技术" },
  { code: "50", name: "通信服务" },
  { code: "55", name: "公用事业" },
  { code: "60", name: "房地产" },
];

/** 已在 record 中完成的黄金 price-target 年片（跳过为 done） */
const GOLD_PT_DONE: Array<{ from: string; to: string }> = [
  { from: "2021-01-01", to: "2024-01-01" },
  { from: "2024-01-01", to: "2025-01-01" },
  { from: "2025-01-01", to: "2026-07-16" },
];

function overlapsDone(from: string, to: string): boolean {
  return GOLD_PT_DONE.some((d) => d.from === from && d.to === to);
}

function main() {
  const windowFrom = argValue("--window-from") ?? DEFAULT_WINDOW_FROM;
  const windowTo =
    argValue("--window-to") ?? new Date().toISOString().slice(0, 10);
  const slices = yearSlices(windowFrom, windowTo);
  const now = new Date().toISOString();
  const tasks: IngestQueueTask[] = [];

  // 同年波次内：年份越新 priority 越小（先跑）
  const yearTie = (y: number) => (2100 - y) * 0.01;

  // P0 US macro
  for (const mode of ["policy", "macro-event", "speech"] as const) {
    for (const s of slices) {
      const recent = s.year >= 2016 ? 0 : 30;
      const task: IngestQueueTask = {
        id: `us-${mode}-${s.year}`,
        mode,
        priority: 10 + recent + yearTie(s.year),
        status: "pending",
        year: s.year,
        query: {
          from: s.from,
          to: s.to,
          country: "US",
          tags: ["美国宏观"],
        },
        notes: `P0 US ${mode} ${s.year}`,
        createdAt: now,
      };
      task.outputFile = defaultOutputFile(task);
      tasks.push(task);
    }
  }

  // P0 Gold: price-target full window + macro-event + policy
  for (const mode of ["price-target", "macro-event", "policy"] as const) {
    for (const s of slices) {
      const recent = s.year >= 2016 ? 0 : 30;
      const done =
        mode === "price-target" && overlapsDone(s.from, s.to);
      // 黄金已完成的是跨年片，按年切片时用年重叠粗标：2021-2025 的 PT 年片标 done
      const yearDone =
        mode === "price-target" &&
        s.year >= 2021 &&
        s.year <= 2025;
      const task: IngestQueueTask = {
        id: `gold-${mode}-${s.year}`,
        mode,
        priority: 20 + recent + yearTie(s.year),
        status: done || yearDone ? "done" : "pending",
        year: s.year,
        query: {
          from: s.from,
          to: s.to,
          assets: ["GLD", "GC=F"],
          industries: ["15"],
          tags: ["黄金"],
        },
        notes:
          done || yearDone
            ? "P0 gold — already ingested (record 2021–2026 PT)"
            : `P0 gold ${mode} ${s.year}`,
        outputFile: `.data/gold-ingest-2021-2026.json`,
        createdAt: now,
      };
      if (!(done || yearDone)) {
        task.outputFile = defaultOutputFile(task);
      }
      tasks.push(task);
    }
  }

  // P1 GICS industry policy + macro-event（近年优先）
  for (const sector of GICS_SECTORS) {
    for (const mode of ["policy", "macro-event"] as const) {
      for (const s of slices) {
        const recent = s.year >= 2016 ? 0 : 30;
        const task: IngestQueueTask = {
          id: `gics${sector.code}-${mode}-${s.year}`,
          mode,
          priority: 30 + recent + Number(sector.code) * 0.1 + yearTie(s.year),
          status: "pending",
          year: s.year,
          query: {
            from: s.from,
            to: s.to,
            industries: [sector.code],
            tags: [sector.name],
            country: "US",
          },
          notes: `P1 GICS ${sector.code} ${sector.name} ${mode}`,
          createdAt: now,
        };
        task.outputFile = defaultOutputFile(task);
        tasks.push(task);
      }
    }
  }

  // P1 broad assets
  for (const asset of [
    { ticker: "SPY", tag: "美股宽基" },
    { ticker: "QQQ", tag: "纳指" },
    { ticker: "TLT", tag: "美债利率" },
  ]) {
    for (const mode of ["macro-event", "policy"] as const) {
      for (const s of slices) {
        if (s.year < 2016) continue; // 宽基先只排近年
        const task: IngestQueueTask = {
          id: `${asset.ticker}-${mode}-${s.year}`,
          mode,
          priority: 40 + yearTie(s.year),
          status: "pending",
          year: s.year,
          query: {
            from: s.from,
            to: s.to,
            assets: [asset.ticker],
            tags: [asset.tag],
            country: "US",
          },
          notes: `P1 ${asset.ticker} ${mode}`,
          createdAt: now,
        };
        task.outputFile = defaultOutputFile(task);
        tasks.push(task);
      }
    }
  }

  const queue = loadQueue();
  queue.windowFrom = windowFrom;
  queue.windowTo = windowTo;
  const refreshPending = process.argv.includes("--refresh-pending");
  const { added, skippedExisting, refreshed } = upsertTasks(queue, tasks, {
    refreshPending,
  });
  saveQueue(queue);

  console.log(
    JSON.stringify(
      {
        windowFrom,
        windowTo,
        seeded: tasks.length,
        added,
        skippedExisting,
        refreshed,
        totalInQueue: queue.tasks.length,
      },
      null,
      2,
    ),
  );
}

main();
