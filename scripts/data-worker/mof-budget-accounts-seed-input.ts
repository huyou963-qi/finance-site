import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ObservationPoint } from "../../src/lib/data/scheduler/types";

export type BudgetAvailability = { key: string; lastYear: number; lastValue: number; tableLatestYear: number };
export type BudgetSeedInput = { entries: BudgetAvailability[]; history: Map<string, ObservationPoint[]> | null; capturedAt?: string };
export type BudgetAvailabilitySnapshot = { sourceUrl: string; capturedAt: string; entries: BudgetAvailability[] };

function validateEntries(entries: unknown): BudgetAvailability[] {
  if (!Array.isArray(entries) || !entries.length) throw new Error("年度决算可用指标快照为空");
  const seen = new Set<string>();
  return entries.map((entry: BudgetAvailability) => {
    if (!entry || typeof entry.key !== "string" || !entry.key || seen.has(entry.key) ||
        !Number.isInteger(entry.lastYear) || entry.lastYear < 2010 ||
        !Number.isFinite(entry.lastValue) || !Number.isInteger(entry.tableLatestYear) ||
        entry.tableLatestYear < entry.lastYear) throw new Error("年度决算可用指标快照格式错误");
    seen.add(entry.key);
    return { key: entry.key, lastYear: entry.lastYear, lastValue: entry.lastValue, tableLatestYear: entry.tableLatestYear };
  });
}

/** Offline mode never invokes loadLive and cannot return observations for insertion. */
export async function loadBudgetSeedInput(options: {
  definitionsOnly: boolean; writeCatalog: boolean; snapshotPath: string; sourceUrl: string;
  loadLive: () => Promise<BudgetSeedInput>;
}): Promise<BudgetSeedInput> {
  if (options.definitionsOnly) {
    if (options.writeCatalog) throw new Error("--definitions-only 与 --write-catalog 不能同时使用");
    const snapshot = JSON.parse(await readFile(options.snapshotPath, "utf8")) as BudgetAvailabilitySnapshot;
    if (snapshot.sourceUrl !== options.sourceUrl || !Number.isFinite(Date.parse(snapshot.capturedAt))) throw new Error("年度决算快照来源或时间无效");
    return { entries: validateEntries(snapshot.entries), history: null, capturedAt: snapshot.capturedAt };
  }
  const live = await options.loadLive();
  const entries = validateEntries(live.entries);
  const capturedAt = new Date().toISOString();
  if (options.writeCatalog) {
    await mkdir(dirname(options.snapshotPath), { recursive: true });
    await writeFile(options.snapshotPath, JSON.stringify({ sourceUrl: options.sourceUrl, capturedAt, entries }, null, 2) + "\n", "utf8");
  }
  return { entries, history: live.history, capturedAt };
}
