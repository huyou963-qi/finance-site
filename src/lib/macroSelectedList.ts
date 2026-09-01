import { MACRO_MAX_SERIES } from "@/lib/data/macroCatalog";

export type MacroSelectedSeriesItem = { type: "series"; key: string };
export type MacroSelectedDerivedItem = { type: "derived"; key: string };
export type MacroSelectedDividerItem = { type: "divider"; id: string; label?: string };
export type MacroSelectedListItem =
  | MacroSelectedSeriesItem
  | MacroSelectedDerivedItem
  | MacroSelectedDividerItem;

export function keysFromListItems(items: MacroSelectedListItem[]): string[] {
  return items
    .filter((i): i is MacroSelectedSeriesItem => i.type === "series")
    .map((i) => i.key);
}

/** 列表中的全部可见指标顺序（原始指标 + 指标间运算结果）。 */
export function displayKeysFromListItems(items: MacroSelectedListItem[]): string[] {
  return items
    .filter(
      (i): i is MacroSelectedSeriesItem | MacroSelectedDerivedItem => i.type !== "divider",
    )
    .map((i) => i.key);
}

/** 与列表展示顺序无关的成员身份；用于隔离“排序”和“增删指标”的响应链。 */
export function membershipSignatureFromListItems(items: MacroSelectedListItem[]): string {
  return JSON.stringify(keysFromListItems(items).sort());
}

export function setFromListItems(items: MacroSelectedListItem[]): Set<string> {
  return new Set(keysFromListItems(items));
}

export function listItemsFromKeys(keys: Iterable<string>): MacroSelectedListItem[] {
  return [...keys].map((key) => ({ type: "series", key }));
}

/** 从模板恢复列表：保留分割线顺序，并与 selectedKeys 对齐 */
export function listItemsFromTemplate(
  keys: string[],
  savedItems?: MacroSelectedListItem[],
  derivedKeys: string[] = [],
): MacroSelectedListItem[] {
  if (!savedItems?.length) {
    return [
      ...listItemsFromKeys(keys),
      ...derivedKeys.map((key): MacroSelectedDerivedItem => ({ type: "derived", key })),
    ];
  }
  const keySet = new Set(keys);
  const derivedKeySet = new Set(derivedKeys);
  const filtered = savedItems.filter(
    (i) =>
      i.type === "divider" ||
      (i.type === "series" && keySet.has(i.key)) ||
      (i.type === "derived" && derivedKeySet.has(i.key)),
  );
  const existing = new Set(displayKeysFromListItems(filtered));
  const additions: MacroSelectedSeriesItem[] = keys
    .filter((k) => !existing.has(k))
    .map((key) => ({ type: "series", key }));
  const derivedAdditions: MacroSelectedDerivedItem[] = derivedKeys
    .filter((k) => !existing.has(k))
    .map((key) => ({ type: "derived", key }));
  return [...filtered, ...additions, ...derivedAdditions];
}

export function createDividerItem(label?: string): MacroSelectedDividerItem {
  return {
    type: "divider",
    id: `div-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    label: label?.trim() || undefined,
  };
}

/** 与 Set 变更同步：保留分界线顺序，移除已取消勾选的序列，新勾选追加到末尾 */
export function syncListWithKeys(
  prev: MacroSelectedListItem[],
  nextKeys: Set<string>,
  maxSeries = MACRO_MAX_SERIES,
): MacroSelectedListItem[] {
  const capped = capKeysInSet(nextKeys, maxSeries);
  const filtered = prev.filter(
    (i) => i.type === "divider" || i.type === "derived" || capped.has(i.key),
  );
  const existing = new Set(keysFromListItems(filtered));
  const additions: MacroSelectedSeriesItem[] = [];
  for (const key of capped) {
    if (!existing.has(key)) additions.push({ type: "series", key });
  }
  return [...filtered, ...additions];
}

/** 与可见衍生指标同步：保留现有位置，删除失效项，新结果追加到末尾。 */
export function syncListWithDerivedKeys(
  prev: MacroSelectedListItem[],
  derivedKeys: Iterable<string>,
): MacroSelectedListItem[] {
  const valid = new Set(derivedKeys);
  const filtered = prev.filter(
    (i) => i.type !== "derived" || valid.has(i.key),
  );
  const existing = new Set(displayKeysFromListItems(filtered));
  const additions: MacroSelectedDerivedItem[] = [];
  for (const key of valid) {
    if (!existing.has(key)) additions.push({ type: "derived", key });
  }
  return [...filtered, ...additions];
}

function capKeysInSet(keys: Set<string>, max: number): Set<string> {
  if (keys.size <= max) return keys;
  return new Set([...keys].slice(0, max));
}

export function reorderListItems(
  items: MacroSelectedListItem[],
  fromIndex: number,
  toIndex: number,
): MacroSelectedListItem[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return items;
  if (fromIndex >= items.length || toIndex >= items.length) return items;
  const out = [...items];
  const [moved] = out.splice(fromIndex, 1);
  if (!moved) return items;
  out.splice(toIndex, 0, moved);
  return out;
}

export function insertDividerAfter(
  items: MacroSelectedListItem[],
  afterIndex: number,
  label?: string,
): MacroSelectedListItem[] {
  const divider = createDividerItem(label);
  const insertAt = Math.min(Math.max(afterIndex + 1, 0), items.length);
  const out = [...items];
  out.splice(insertAt, 0, divider);
  return out;
}

export function removeDivider(items: MacroSelectedListItem[], id: string): MacroSelectedListItem[] {
  return items.filter((i) => !(i.type === "divider" && i.id === id));
}

export function updateDividerLabel(
  items: MacroSelectedListItem[],
  id: string,
  label: string,
): MacroSelectedListItem[] {
  const trimmed = label.trim();
  return items.map((i) => {
    if (i.type !== "divider" || i.id !== id) return i;
    return { ...i, label: trimmed || undefined };
  });
}

export function dividerDisplayLabel(item: MacroSelectedDividerItem): string {
  return item.label?.trim() || "分组";
}

export function removeSeriesKey(items: MacroSelectedListItem[], key: string): MacroSelectedListItem[] {
  return items.filter((i) => !(i.type === "series" && i.key === key));
}

export function sanitizeSelectedListItems(input: unknown): MacroSelectedListItem[] {
  if (!Array.isArray(input)) return [];
  const out: MacroSelectedListItem[] = [];
  const seenKeys = new Set<string>();
  let seriesCount = 0;
  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const x = row as Record<string, unknown>;
    const type = String(x.type ?? "").trim();
    if (type === "series" || type === "derived") {
      const key = String(x.key ?? "").trim();
      if (!key || seenKeys.has(key)) continue;
      if (type === "derived" && !key.startsWith("calc:")) continue;
      if (type === "series" && seriesCount >= MACRO_MAX_SERIES) continue;
      seenKeys.add(key);
      out.push(type === "series" ? { type: "series", key } : { type: "derived", key });
      if (type === "series") seriesCount += 1;
    } else if (type === "divider") {
      const id = String(x.id ?? "").trim();
      if (!id) continue;
      const label =
        typeof x.label === "string" && x.label.trim() ? x.label.trim() : undefined;
      out.push({ type: "divider", id, label });
    }
  }
  return out;
}
