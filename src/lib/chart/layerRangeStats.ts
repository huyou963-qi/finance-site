/**
 * 叠加层（价格 / 运算 / 基本面）区间统计：纯函数，不依赖 lightweight-charts 运行时。
 */

export type LayerRangeStatsResult = {
  label: string;
  color: string;
  /** 区间内命中的有效点数 */
  count: number;
  first: number;
  last: number;
  max: number;
  min: number;
  /** (last - first) / |first| * 100；first=0 时为 0 */
  changePct: number;
  /** (max - min) / |min| * 100；min=0 时为 0 */
  amplitudePct: number;
};

export type LayerRangeSeriesInput = {
  label: string;
  color: string;
  /** epoch 秒 → 值（与主图 K 线 time 对齐） */
  points: { time: number; value: number }[];
};

export type TimedBar = { time: number };

/**
 * 在主图区间 [i0,i1] 内，按 K 线时间对齐叠加序列并统计。
 * 仅统计该区间内有值的点（表达式 inner-join 后缺日自然跳过）。
 */
export function computeLayerRangeStats(
  bars: TimedBar[],
  i0: number,
  i1: number,
  layer: LayerRangeSeriesInput,
): LayerRangeStatsResult | null {
  const n = bars.length;
  if (!n || i0 < 0 || i1 < 0 || i0 > i1 || i1 >= n) return null;
  if (!layer.points.length) return null;

  const byTime = new Map<number, number>();
  for (const p of layer.points) {
    if (!Number.isFinite(p.time) || !Number.isFinite(p.value)) continue;
    byTime.set(p.time, p.value);
  }
  if (!byTime.size) return null;

  const values: number[] = [];
  for (let i = i0; i <= i1; i++) {
    const ts = bars[i]!.time;
    if (!Number.isFinite(ts)) continue;
    const v = byTime.get(ts);
    if (v == null || !Number.isFinite(v)) continue;
    values.push(v);
  }
  if (!values.length) return null;

  let max = -Infinity;
  let min = Infinity;
  for (const v of values) {
    if (v > max) max = v;
    if (v < min) min = v;
  }
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const changePct =
    first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
  const amplitudePct =
    min !== 0 ? ((max - min) / Math.abs(min)) * 100 : 0;

  return {
    label: layer.label,
    color: layer.color,
    count: values.length,
    first,
    last,
    max,
    min,
    changePct,
    amplitudePct,
  };
}

/** 批量计算可见叠加层区间统计（跳过无数据层） */
export function computeAllLayerRangeStats(
  bars: TimedBar[],
  i0: number,
  i1: number,
  layers: LayerRangeSeriesInput[],
): LayerRangeStatsResult[] {
  const out: LayerRangeStatsResult[] = [];
  for (const layer of layers) {
    const s = computeLayerRangeStats(bars, i0, i1, layer);
    if (s) out.push(s);
  }
  return out;
}
