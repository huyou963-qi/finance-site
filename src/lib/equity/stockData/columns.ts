/**
 * 「股票数据」列的增改（纯函数，浏览器使用）：多报告期展开成一组列，修改参数时整组重建。
 */

import { getIndicator, normalizeParams } from "./indicatorRegistry";
import type { ColumnParams, ColumnSpec, IndicatorDef, MultiPeriod, PeriodSlot, PeriodSpec } from "./types";

const SLOT_ORDER: readonly PeriodSlot[] = ["Q1", "Q2", "Q3", "Q4", "FY"];

/** 按财年升序、年内 Q1→Q4→年报 的顺序展开 */
export function expandMultiPeriod(m: MultiPeriod): PeriodSpec[] {
  const slots = SLOT_ORDER.filter((s) => m.slots.includes(s));
  const out: PeriodSpec[] = [];
  for (let year = m.fromYear; year <= m.toYear; year++) {
    for (const s of slots) out.push(s === "FY" ? { kind: "FY", year } : { kind: "FQ", year, q: Number(s.slice(1)) as 1 | 2 | 3 | 4 });
  }
  return out;
}

export function multiPeriodCount(m: MultiPeriod | undefined): number {
  return m ? Math.max(0, m.toYear - m.fromYear + 1) * SLOT_ORDER.filter((s) => m.slots.includes(s)).length : 1;
}

/** 一个指标按参数生成的列：选了多报告期且该指标有报告期参数时生成一组，否则一列 */
export function buildColumns(def: IndicatorDef, params: ColumnParams, multi: MultiPeriod | undefined, newKey: () => string, reuseKey?: string): ColumnSpec[] {
  if (!multi || !def.params.includes("period")) {
    return [{ key: reuseKey ?? newKey(), indicatorId: def.id, params: normalizeParams(def, params) }];
  }
  const groupId = newKey();
  return expandMultiPeriod(multi).map((period) => ({
    key: newKey(),
    indicatorId: def.id,
    params: normalizeParams(def, { ...params, period }),
    groupId,
    multi,
  }));
}

/** 选中的列扩到整组：多报告期的组只能整体修改 */
export function expandToGroups(columns: readonly ColumnSpec[], keys: Iterable<string>): string[] {
  const picked = new Set(keys);
  const groups = new Set(columns.filter((c) => picked.has(c.key) && c.groupId).map((c) => c.groupId!));
  return columns.filter((c) => picked.has(c.key) || (c.groupId && groups.has(c.groupId))).map((c) => c.key);
}

type Unit = { first: number; cols: ColumnSpec[] };

function unitsOf(columns: readonly ColumnSpec[], keys: readonly string[]): Map<string, Unit> {
  const picked = new Set(expandToGroups(columns, keys));
  const units = new Map<string, Unit>();
  columns.forEach((c, i) => {
    if (!picked.has(c.key)) return;
    const id = c.groupId ?? `#${c.key}`;
    const u = units.get(id) ?? { first: i, cols: [] };
    u.cols.push(c);
    units.set(id, u);
  });
  return units;
}

/** 修改参数后的总列数（用于在确定前检查 50 列上限） */
export function columnCountAfterEdit(columns: readonly ColumnSpec[], keys: readonly string[], multi: MultiPeriod | undefined): number {
  let n = columns.length;
  for (const u of unitsOf(columns, keys).values()) {
    const def = getIndicator(u.cols[0]!.indicatorId);
    n += (def?.params.includes("period") ? multiPeriodCount(multi) : 1) - u.cols.length;
  }
  return n;
}

/**
 * 对选中的列（自动扩到整组）应用新参数：每个指标单元在原位置重建。
 * 单列改成单列时保留原 key，排序和选中状态不丢。
 */
export function editColumns(
  columns: readonly ColumnSpec[],
  keys: readonly string[],
  params: ColumnParams,
  multi: MultiPeriod | undefined,
  newKey: () => string,
): ColumnSpec[] {
  const units = unitsOf(columns, keys);
  const replaced = new Map<number, ColumnSpec[]>();
  const drop = new Set<string>();
  for (const u of units.values()) {
    const def = getIndicator(u.cols[0]!.indicatorId);
    if (!def) continue;
    const reuse = u.cols.length === 1 && !u.cols[0]!.groupId ? u.cols[0]!.key : undefined;
    replaced.set(u.first, buildColumns(def, params, multi, newKey, reuse));
    for (const c of u.cols) drop.add(c.key);
  }
  const out: ColumnSpec[] = [];
  columns.forEach((c, i) => {
    const rep = replaced.get(i);
    if (rep) out.push(...rep);
    else if (!drop.has(c.key)) out.push(c);
  });
  return out;
}
