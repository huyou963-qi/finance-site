import type { MacroPayload, MacroSeriesItem } from "@/lib/data/types";

/** slot 分配：number 为图序；null 表示「待选集」——不参与任何分图 */
export type MacroSlotAssignment = Record<string, number | null>;

/** 将序列按 slot（0..layoutMode-1）分组；assignment[k]===null 的序列不分入任何图（单图亦同） */
export function partitionMacroSeries(
  payload: MacroPayload,
  layoutMode: 1 | 2 | 3 | 4,
  assignment: MacroSlotAssignment,
): MacroSeriesItem[][] {
  const n = layoutMode;
  const buckets: MacroSeriesItem[][] = Array.from({ length: n }, () => []);

  for (const s of payload.series) {
    const key = s.key ?? "";
    let slot = assignment[key];
    if (slot === null) continue;
    if (slot === undefined || Number.isNaN(slot)) slot = 0;
    slot = Math.max(0, Math.min(n - 1, Math.floor(slot)));
    buckets[slot].push(s);
  }

  return buckets;
}
