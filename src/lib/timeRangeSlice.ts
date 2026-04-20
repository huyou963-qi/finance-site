/** 将 ECharts dataZoom 的 0–100 百分比映射为类目下标区间（含端点） */
export function indicesFromDataZoomPct(
  startPct: number,
  endPct: number,
  len: number,
): { i0: number; i1: number } {
  if (len <= 0) return { i0: 0, i1: -1 };
  const clampPct = (p: number) => Math.max(0, Math.min(100, p));
  const lo = clampPct(Math.min(startPct, endPct));
  const hi = clampPct(Math.max(startPct, endPct));
  const i0 = Math.floor((lo / 100) * len);
  const i1Exclusive = Math.ceil((hi / 100) * len);
  const i1 = Math.min(len - 1, Math.max(i0, i1Exclusive - 1));
  return { i0, i1 };
}
