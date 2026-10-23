import type { PriceClosePoint } from "./deriveLayerSeries";

/** 按时间覆盖主图；单次 limit 会被服务端裁剪，不能用主图柱数代替时间边界。 */
export async function loadLayerPriceHistory(
  loadPage: (before?: number) => Promise<PriceClosePoint[]>,
  fromSec: number | null,
  signal?: AbortSignal,
): Promise<PriceClosePoint[]> {
  const byTime = new Map<number, PriceClosePoint>();
  let before: number | undefined;
  while (!signal?.aborted) {
    const page = await loadPage(before);
    if (signal?.aborted) break;
    // 防止源忽略 before 或返回边界重复点时陷入循环。
    const older = page.filter((p) => Number.isFinite(p.time) &&
      (before == null || p.time < before));
    if (!older.length) break;
    let earliest = Infinity;
    for (const point of older) {
      byTime.set(point.time, point);
      earliest = Math.min(earliest, point.time);
    }
    if (fromSec == null || earliest <= fromSec) break;
    before = earliest;
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}
