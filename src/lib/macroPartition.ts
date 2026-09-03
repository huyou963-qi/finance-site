import type { MacroPayload, MacroSeriesItem } from "@/lib/data/types";

/** slot 分配：number 为图序；null 表示「待选集」——不参与任何分图 */
export type MacroSlotAssignment = Record<string, number | null>;

export type MacroSlotSeriesOrder = Partial<Record<number, string[]>>;

/** 让设置面板的指标顺序跟实际图表 payload 保持一致；尚无数据的键稳定追加。 */
export function orderMacroKeysByPayload(
  keys: readonly string[],
  payload: MacroPayload | null | undefined,
): string[] {
  const remaining = new Set(keys);
  const ordered: string[] = [];
  for (const series of payload?.series ?? []) {
    const key = series.key?.trim();
    if (!key || !remaining.delete(key)) continue;
    ordered.push(key);
  }
  return [...ordered, ...[...remaining].sort((a, b) => a.localeCompare(b))];
}

/** 按用户保存的图内顺序排列；未记录的新指标稳定追加在末尾。 */
export function orderMacroSeriesByKey<T extends { key?: string }>(
  series: readonly T[],
  preferredKeys?: readonly string[],
): T[] {
  if (!preferredKeys?.length) return [...series];
  const rank = new Map(preferredKeys.map((key, index) => [key, index]));
  return series
    .map((item, index) => ({ item, index, rank: rank.get(item.key ?? "") }))
    .sort((a, b) => {
      if (a.rank !== undefined && b.rank !== undefined) return a.rank - b.rank;
      if (a.rank !== undefined) return -1;
      if (b.rank !== undefined) return 1;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

export function moveMacroKeyRelative(
  keys: readonly string[],
  draggedKey: string,
  targetKey: string,
  edge: "before" | "after",
): string[] {
  if (draggedKey === targetKey) return [...keys];
  const next = keys.filter((key) => key !== draggedKey);
  const targetIndex = next.indexOf(targetKey);
  if (targetIndex < 0) return [...next, draggedKey];
  next.splice(targetIndex + (edge === "after" ? 1 : 0), 0, draggedKey);
  return next;
}

/** 将序列按 slot（0..layoutMode-1）分组；assignment[k]===null 的序列不分入任何图（单图亦同） */
export function partitionMacroSeries(
  payload: MacroPayload,
  layoutMode: 1 | 2 | 3 | 4 | 5 | 6,
  assignment: MacroSlotAssignment,
  slotSeriesOrder?: MacroSlotSeriesOrder,
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

  return buckets.map((bucket, slot) => orderMacroSeriesByKey(bucket, slotSeriesOrder?.[slot]));
}
