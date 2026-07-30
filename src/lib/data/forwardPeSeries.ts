/**
 * Forward PE 日线对齐（纯函数，可客户端使用）。
 */

export type ForwardEpsPoint = {
  date: string;
  forwardEps: number;
};

/** 日线 Forward PE：收盘 / 向前填充的 Forward EPS */
export function forwardPeFromCloses(
  closes: { time: number; close: number }[],
  timeline: ForwardEpsPoint[],
): { time: number; value: number }[] {
  if (!closes.length || !timeline.length) return [];
  const sorted = [...timeline].sort((a, b) => a.date.localeCompare(b.date));
  let ti = 0;
  let last = sorted[0]!.forwardEps;
  const out: { time: number; value: number }[] = [];

  for (const c of closes) {
    const ds = new Date(c.time * 1000).toISOString().slice(0, 10);
    while (ti + 1 < sorted.length && sorted[ti + 1]!.date <= ds) {
      ti++;
      last = sorted[ti]!.forwardEps;
    }
    if (sorted[0]!.date > ds) continue;
    if (!Number.isFinite(c.close) || c.close <= 0 || last <= 0) continue;
    const pe = c.close / last;
    if (!Number.isFinite(pe) || pe <= 0 || pe > 1e6) continue;
    out.push({ time: c.time, value: pe });
  }
  return out;
}
