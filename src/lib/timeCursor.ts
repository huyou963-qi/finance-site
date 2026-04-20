/**
 * 将宏观横轴类目解析为可比较的时间戳（取该段起点：年→1/1，月→月初，日→当日 0 时 UTC）。
 * 无法解析时返回 null。
 */
export function categoryToTimestampUtc(label: string): number | null {
  const s = label.trim();
  if (/^\d{4}$/.test(s)) {
    return Date.UTC(Number(s), 0, 1);
  }
  if (/^\d{4}-\d{2}$/.test(s)) {
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(5, 7)) - 1;
    return Date.UTC(y, m, 1);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const y = Number(s.slice(0, 4));
    const mo = Number(s.slice(5, 7)) - 1;
    const d = Number(s.slice(8, 10));
    return Date.UTC(y, mo, d);
  }
  return null;
}

/**
 * 在另一组类目中找与 `target` 时间最近的一个下标（年/月/日混排时按时间距离最小）。
 */
export function nearestCategoryIndex(target: string, categories: string[]): number {
  const t = categoryToTimestampUtc(target);
  if (t === null || categories.length === 0) return 0;
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < categories.length; i++) {
    const c = categoryToTimestampUtc(categories[i] ?? "");
    if (c === null) continue;
    const d = Math.abs(c - t);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/**
 * ECharts convertFromPixel / pointToData 返回值 → 类目下标。
 * category 轴常见为 ordinal 刻度下标（浮点）；也可能是类目字符串。
 */
export function dataIndexFromConvert(conv: unknown, categories: string[]): number | null {
  if (!Array.isArray(conv) || conv.length < 1 || conv[0] == null) return null;
  const v0 = conv[0];
  if (typeof v0 === "number" && Number.isFinite(v0)) {
    const i = Math.round(v0);
    const n = categories.length;
    if (n <= 0) return null;
    return Math.max(0, Math.min(n - 1, i));
  }
  const s = String(v0);
  return nearestCategoryIndex(s, categories);
}
