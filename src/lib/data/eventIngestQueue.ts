/**
 * market-event-ingest 批跑队列（本地 .data 真相源）。
 * Agent / CLI 共用：生成、领取、标记完成、覆盖率统计。
 */

import fs from "node:fs";
import path from "node:path";

export const INGEST_QUEUE_PATH = path.join(
  process.cwd(),
  ".data",
  "market-event-ingest-queue.json",
);

export const INGEST_RECORD_PATH = path.join(
  process.cwd(),
  ".data",
  "market-event-ingest-record.md",
);

export const INGEST_OUT_DIR = path.join(process.cwd(), ".data", "ingest");

export type IngestQueueStatus = "pending" | "running" | "done" | "blocked";

export type IngestQueueQuery = {
  from: string;
  to: string;
  country?: string;
  symbol?: string;
  assets?: string[];
  industries?: string[];
  tags?: string[];
};

export type IngestQueueTask = {
  id: string;
  mode: string;
  priority: number;
  status: IngestQueueStatus;
  query: IngestQueueQuery;
  outputFile?: string;
  notes?: string;
  gicsSector?: string;
  year?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type IngestQueueFile = {
  version: 1;
  description?: string;
  windowFrom: string;
  windowTo: string;
  updatedAt?: string;
  tasks: IngestQueueTask[];
};

/** GICS sector 波次：数字越小越先跑 */
export const SECTOR_WAVE_ORDER: Record<string, number> = {
  "Information Technology": 1,
  Financials: 2,
  "Health Care": 3,
  "Consumer Discretionary": 4,
  Communication: 5,
  "Communication Services": 5,
  Industrials: 6,
  "Consumer Staples": 7,
  Energy: 8,
  Materials: 9,
  Utilities: 10,
  "Real Estate": 11,
};

export const DEFAULT_WINDOW_FROM = "2006-01-01";
export const RECENT_YEAR_FROM = 2016;

export function yearSlices(
  windowFrom: string,
  windowTo: string,
): Array<{ year: number; from: string; to: string }> {
  const startY = Number(windowFrom.slice(0, 4));
  const endDate = windowTo.slice(0, 10);
  const endY = Number(endDate.slice(0, 4));
  const out: Array<{ year: number; from: string; to: string }> = [];
  for (let y = startY; y <= endY; y++) {
    const from = `${y}-01-01`;
    const to =
      y === endY ? endDate : `${y}-12-31`;
    if (from > endDate) break;
    out.push({ year: y, from, to });
  }
  return out;
}

export function defaultOutputFile(task: Pick<IngestQueueTask, "mode" | "query" | "year">): string {
  const q = task.query;
  const object =
    q.symbol?.toUpperCase() ||
    q.assets?.[0]?.replace(/=/g, "") ||
    (q.industries?.[0] ? `gics${q.industries[0]}` : null) ||
    q.country ||
    "x";
  const from = q.from.slice(0, 10);
  const to = q.to.slice(0, 10);
  return `.data/ingest/${object}-${task.mode}-${from}_${to}.json`;
}

export function emptyQueue(
  windowFrom = DEFAULT_WINDOW_FROM,
  windowTo = new Date().toISOString().slice(0, 10),
): IngestQueueFile {
  return {
    version: 1,
    description: "market-event-ingest 批跑队列（P0 宏观/黄金 + P2 SP500）",
    windowFrom,
    windowTo,
    updatedAt: new Date().toISOString(),
    tasks: [],
  };
}

export function loadQueue(filePath = INGEST_QUEUE_PATH): IngestQueueFile {
  if (!fs.existsSync(filePath)) {
    return emptyQueue();
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as IngestQueueFile;
  if (raw.version !== 1 || !Array.isArray(raw.tasks)) {
    throw new Error(`Invalid queue file: ${filePath}`);
  }
  return raw;
}

export function saveQueue(queue: IngestQueueFile, filePath = INGEST_QUEUE_PATH): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  queue.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(queue, null, 2) + "\n", "utf8");
}

/**
 * 按 id 合并。
 * - 默认：已有 id 跳过（保留 done/running/blocked/pending）
 * - refreshPending：对仍为 pending 的任务刷新 priority/query/outputFile（不改 status）
 */
export function upsertTasks(
  queue: IngestQueueFile,
  incoming: IngestQueueTask[],
  opts?: { refreshPending?: boolean },
): { added: number; skippedExisting: number; refreshed: number } {
  const byId = new Map(queue.tasks.map((t) => [t.id, t]));
  let added = 0;
  let skippedExisting = 0;
  let refreshed = 0;
  const now = new Date().toISOString();
  for (const t of incoming) {
    const prev = byId.get(t.id);
    if (prev) {
      if (opts?.refreshPending && prev.status === "pending") {
        byId.set(t.id, {
          ...prev,
          priority: t.priority,
          query: t.query,
          outputFile: t.outputFile ?? prev.outputFile,
          notes: t.notes ?? prev.notes,
          gicsSector: t.gicsSector ?? prev.gicsSector,
          year: t.year ?? prev.year,
          updatedAt: now,
        });
        refreshed++;
      } else {
        skippedExisting++;
      }
      continue;
    }
    byId.set(t.id, { ...t, createdAt: t.createdAt ?? now, updatedAt: now });
    added++;
  }
  queue.tasks = [...byId.values()].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.id.localeCompare(b.id);
  });
  return { added, skippedExisting, refreshed };
}

export function claimNextPending(
  queue: IngestQueueFile,
  opts?: { modes?: string[]; maxPriority?: number },
): IngestQueueTask | null {
  const modes = opts?.modes ? new Set(opts.modes) : null;
  const task = queue.tasks.find((t) => {
    if (t.status !== "pending") return false;
    if (modes && !modes.has(t.mode)) return false;
    if (opts?.maxPriority != null && t.priority > opts.maxPriority) return false;
    return true;
  });
  if (!task) return null;
  task.status = "running";
  task.updatedAt = new Date().toISOString();
  if (!task.outputFile) task.outputFile = defaultOutputFile(task);
  return task;
}

export function markTaskStatus(
  queue: IngestQueueFile,
  id: string,
  status: IngestQueueStatus,
  patch?: Partial<Pick<IngestQueueTask, "outputFile" | "notes">>,
): IngestQueueTask | null {
  const task = queue.tasks.find((t) => t.id === id);
  if (!task) return null;
  task.status = status;
  task.updatedAt = new Date().toISOString();
  if (patch?.outputFile) task.outputFile = patch.outputFile;
  if (patch?.notes != null) task.notes = patch.notes;
  return task;
}

export function queueStats(queue: IngestQueueFile): Record<string, number> {
  const stats: Record<string, number> = {
    total: queue.tasks.length,
    pending: 0,
    running: 0,
    done: 0,
    blocked: 0,
  };
  for (const t of queue.tasks) {
    stats[t.status] = (stats[t.status] ?? 0) + 1;
  }
  return stats;
}

export function coverageByModeYear(queue: IngestQueueFile): Array<{
  mode: string;
  year: number;
  done: number;
  total: number;
}> {
  const map = new Map<string, { mode: string; year: number; done: number; total: number }>();
  for (const t of queue.tasks) {
    if (t.year == null) continue;
    const key = `${t.mode}:${t.year}`;
    const row = map.get(key) ?? { mode: t.mode, year: t.year, done: 0, total: 0 };
    row.total++;
    if (t.status === "done") row.done++;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.mode.localeCompare(b.mode) || a.year - b.year);
}

export function appendIngestRecord(lineCells: string[]): void {
  fs.mkdirSync(path.dirname(INGEST_RECORD_PATH), { recursive: true });
  if (!fs.existsSync(INGEST_RECORD_PATH)) {
    fs.writeFileSync(
      INGEST_RECORD_PATH,
      `# market-event-ingest 检索进度记录表

| runAt(UTC+8) | mode | assets(优先) | tags(必须包含) | industries(GICS) | eventTypes | coverage(from→to) | output event record | status |
|---|---|---|---|---|---|---|---|---|
`,
      "utf8",
    );
  }
  const line = `| ${lineCells.join(" | ")} |\n`;
  fs.appendFileSync(INGEST_RECORD_PATH, line, "utf8");
}

export function sectorWaveRank(sector: string | null | undefined): number {
  if (!sector) return 99;
  return SECTOR_WAVE_ORDER[sector] ?? 50;
}

/** 近年优先：2016+ 基准 priority 更小 */
export function yearPriorityOffset(year: number, recentFrom = RECENT_YEAR_FROM): number {
  return year >= recentFrom ? 0 : 30;
}
