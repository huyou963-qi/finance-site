/**
 * market-event-ingest 一眼进度看板（由队列 + ingest JSON 生成）。
 */
import fs from "node:fs";
import path from "node:path";
import {
  INGEST_OUT_DIR,
  loadQueue,
  queueStats,
  type IngestQueueFile,
  type IngestQueueTask,
} from "./eventIngestQueue";

export const INGEST_PROGRESS_PATH = path.join(
  process.cwd(),
  ".data",
  "market-event-ingest-progress.md",
);

function waveKey(t: IngestQueueTask): string {
  const id = t.id;
  if (id.startsWith("us-") || id.startsWith("US-")) return "P0 美国宏观";
  if (id.startsWith("gld-") || id.startsWith("GLD-") || id.includes("gold")) return "P0 黄金";
  const gics = id.match(/^gics(\d+)/i);
  if (gics) {
    const code = gics[1];
    const label =
      (
        {
          "10": "能源",
          "15": "原材料",
          "20": "工业",
          "25": "可选消费",
          "30": "必需消费",
          "35": "医疗",
          "40": "金融",
          "45": "科技",
          "50": "通信",
          "55": "公用事业",
          "60": "房地产",
        } as Record<string, string>
      )[code] ?? code;
    return `P1 GICS ${code} ${label}`;
  }
  if (t.query.symbol) return "P2 SP500 个股";
  if (t.notes?.includes("P0")) return "P0 其他";
  if (t.notes?.includes("P1")) return "P1 其他";
  return "其他";
}

function countEventsInOutput(outputFile?: string): {
  events: number;
  skipped: number;
  exists: boolean;
} {
  if (!outputFile) return { events: 0, skipped: 0, exists: false };
  const abs = path.isAbsolute(outputFile)
    ? outputFile
    : path.join(process.cwd(), outputFile);
  if (!fs.existsSync(abs)) return { events: 0, skipped: 0, exists: false };
  try {
    const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as {
      events?: unknown[];
      skipped?: unknown[];
    };
    return {
      events: Array.isArray(raw.events) ? raw.events.length : 0,
      skipped: Array.isArray(raw.skipped) ? raw.skipped.length : 0,
      exists: true,
    };
  } catch {
    return { events: 0, skipped: 0, exists: true };
  }
}

function pct(n: number, d: number): string {
  if (d <= 0) return "0%";
  return `${((100 * n) / d).toFixed(2)}%`;
}

function shanghaiNow(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" });
}

export function buildProgressMarkdown(queue: IngestQueueFile): string {
  const stats = queueStats(queue);
  const total = stats.total ?? 0;
  const done = stats.done ?? 0;
  const pending = stats.pending ?? 0;
  const running = stats.running ?? 0;
  const blocked = stats.blocked ?? 0;
  const remaining = pending + running + blocked;

  const byMode = new Map<
    string,
    { total: number; done: number; pending: number; running: number; blocked: number }
  >();
  const byWave = new Map<
    string,
    { total: number; done: number; pending: number; running: number; blocked: number }
  >();

  for (const t of queue.tasks) {
    for (const [map, key] of [
      [byMode, t.mode] as const,
      [byWave, waveKey(t)] as const,
    ]) {
      const row = map.get(key) ?? {
        total: 0,
        done: 0,
        pending: 0,
        running: 0,
        blocked: 0,
      };
      row.total++;
      row[t.status]++;
      map.set(key, row);
    }
  }

  const runningTasks = queue.tasks.filter((t) => t.status === "running");
  const nextPending = queue.tasks
    .filter((t) => t.status === "pending")
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .slice(0, 15);

  const doneTasks = queue.tasks
    .filter((t) => t.status === "done")
    .sort(
      (a, b) =>
        (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") ||
        a.id.localeCompare(b.id),
    );

  let eventSum = 0;
  let skippedSum = 0;
  const doneRows = doneTasks.map((t) => {
    const c = countEventsInOutput(t.outputFile);
    eventSum += c.events;
    skippedSum += c.skipped;
    return { t, c };
  });

  const lines: string[] = [];
  lines.push("# market-event-ingest 进度看板");
  lines.push("");
  lines.push(
    `> 自动生成于 ${shanghaiNow()}（Asia/Shanghai）。勿手改；刷新：\`npm run events:ingest-dashboard\``,
  );
  lines.push("");
  lines.push("## 一眼总览");
  lines.push("");
  lines.push(`| 指标 | 数量 | 占比 |`);
  lines.push(`|---|---:|---:|`);
  lines.push(`| **总任务格** | **${total}** | 100% |`);
  lines.push(`| **已完成 done** | **${done}** | **${pct(done, total)}** |`);
  lines.push(`| 进行中 running | ${running} | ${pct(running, total)} |`);
  lines.push(`| 待做 pending | ${pending} | ${pct(pending, total)} |`);
  lines.push(`| 阻塞 blocked | ${blocked} | ${pct(blocked, total)} |`);
  lines.push(
    `| **还剩（pending+running+blocked）** | **${remaining}** | **${pct(remaining, total)}** |`,
  );
  lines.push(`| 已完成格内 events 条数合计 | ${eventSum} | — |`);
  lines.push(`| 已完成格内 skipped 条数合计 | ${skippedSum} | — |`);
  lines.push("");
  lines.push("### 数据源（各记什么）");
  lines.push("");
  lines.push("| 文件 | 作用 |");
  lines.push("|---|---|");
  lines.push(
    `| \`.data/market-event-ingest-queue.json\` | **任务真相源**：全部待做/已做格子与 status |`,
  );
  lines.push(
    `| \`.data/ingest/*.json\` | **每格搜集产物**：events[] / skipped[]，正式入库用 |`,
  );
  lines.push(`| \`.data/market-event-ingest-record.md\` | 追加日志（历史行） |`);
  lines.push(
    `| **本文件** \`.data/market-event-ingest-progress.md\` | **一眼看板**：完成度 + 已完成明细 + 下一步 |`,
  );
  lines.push("");
  lines.push(`时间窗：\`${queue.windowFrom}\` → \`${queue.windowTo}\``);
  lines.push("");

  lines.push("## 按 mode");
  lines.push("");
  lines.push("| mode | done | remaining | total | 完成率 |");
  lines.push("|---|---:|---:|---:|---:|");
  for (const mode of [...byMode.keys()].sort()) {
    const r = byMode.get(mode)!;
    const rem = r.pending + r.running + r.blocked;
    lines.push(
      `| ${mode} | ${r.done} | ${rem} | ${r.total} | ${pct(r.done, r.total)} |`,
    );
  }
  lines.push("");

  lines.push("## 按波次（主题）");
  lines.push("");
  lines.push("| 波次 | done | remaining | total | 完成率 |");
  lines.push("|---|---:|---:|---:|---:|");
  const waveOrder = [
    "P0 美国宏观",
    "P0 黄金",
    "P0 其他",
    "P1 GICS 10 能源",
    "P1 GICS 15 原材料",
    "P1 GICS 20 工业",
    "P1 GICS 25 可选消费",
    "P1 GICS 30 必需消费",
    "P1 GICS 35 医疗",
    "P1 GICS 40 金融",
    "P1 GICS 45 科技",
    "P1 GICS 50 通信",
    "P1 GICS 55 公用事业",
    "P1 GICS 60 房地产",
    "P1 其他",
    "P2 SP500 个股",
    "其他",
  ];
  const waves = [...byWave.keys()].sort((a, b) => {
    const ia = waveOrder.indexOf(a);
    const ib = waveOrder.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    return a.localeCompare(b);
  });
  for (const w of waves) {
    const r = byWave.get(w)!;
    const rem = r.pending + r.running + r.blocked;
    lines.push(`| ${w} | ${r.done} | ${rem} | ${r.total} | ${pct(r.done, r.total)} |`);
  }
  lines.push("");

  lines.push("## 当前 / 下一步");
  lines.push("");
  if (runningTasks.length === 0) {
    lines.push("- **running**：无");
  } else {
    for (const t of runningTasks) {
      lines.push(
        `- **running**：\`${t.id}\` — ${t.notes ?? t.mode} → \`${t.outputFile ?? "-"}\``,
      );
    }
  }
  lines.push("");
  lines.push("### 即将领取的 pending（按 priority，前 15）");
  lines.push("");
  lines.push("| # | id | mode | year | notes |");
  lines.push("|---:|---|---|---:|---|");
  nextPending.forEach((t, i) => {
    lines.push(
      `| ${i + 1} | ${t.id} | ${t.mode} | ${t.year ?? ""} | ${(t.notes ?? "").replace(/\|/g, "/")} |`,
    );
  });
  lines.push("");

  lines.push(`## 已完成任务明细（${done}）`);
  lines.push("");
  lines.push(
    "| 更新时间 | id | mode | year | events | skipped | output | notes |",
  );
  lines.push("|---|---|---|---:|---:|---:|---|---|");
  for (const { t, c } of doneRows) {
    const when = (t.updatedAt ?? "").slice(0, 19).replace("T", " ");
    const ev = c.exists ? String(c.events) : "缺文件";
    const sk = c.exists ? String(c.skipped) : "-";
    lines.push(
      `| ${when} | ${t.id} | ${t.mode} | ${t.year ?? ""} | ${ev} | ${sk} | \`${t.outputFile ?? "-"}\` | ${(t.notes ?? "").replace(/\|/g, "/")} |`,
    );
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    "刷新命令：`npm run events:ingest-dashboard`（`events:ingest-next -- --done=...` 也会自动刷新）",
  );
  lines.push("");
  return lines.join("\n");
}

/** 写出进度看板，返回路径 */
export function writeProgressDashboard(queue?: IngestQueueFile): string {
  const q = queue ?? loadQueue();
  const md = buildProgressMarkdown(q);
  fs.mkdirSync(path.dirname(INGEST_PROGRESS_PATH), { recursive: true });
  fs.writeFileSync(INGEST_PROGRESS_PATH, md, "utf8");
  return INGEST_PROGRESS_PATH;
}

export function progressSummary(queue?: IngestQueueFile) {
  const q = queue ?? loadQueue();
  const stats = queueStats(q);
  return {
    ...stats,
    remaining: (stats.pending ?? 0) + (stats.running ?? 0) + (stats.blocked ?? 0),
    progressPath: INGEST_PROGRESS_PATH,
    ingestDir: INGEST_OUT_DIR,
  };
}
