/** Align annotations to actual bars, preserving the source event timestamp. */
export function alignEventMarkersToBars<T extends { time: number; datePrecision?: string; eventTime?: number }>(
  markers: readonly T[], barTimes: readonly number[], interval: string,
): (T & { eventTime: number })[] {
  const bars = [...new Set(barTimes.filter(Number.isFinite))].sort((a, b) => a - b);
  const duration = ({ "15m": 900, "1h": 3600, "4h": 14400 } as Record<string, number>)[interval];
  const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
  if (!bars.length) return [];
  return markers.flatMap(m => {
    if (!Number.isFinite(m.time)) return [];
    let aligned: number | undefined;
    if (!duration || m.datePrecision !== "DATETIME") {
      // Date-only evidence cannot imply a precise hour. Use the first bar on/after that date.
      const target = day(m.time);
      if (target < day(bars[0]) || target > day(bars[bars.length - 1])) return [];
      aligned = bars.find(t => day(t) >= target);
    } else {
      if (m.time < bars[0] || m.time >= bars[bars.length - 1] + duration) return [];
      let lo = 0, hi = bars.length;
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (bars[mid] <= m.time) lo = mid + 1; else hi = mid; }
      const previous = bars[lo - 1];
      aligned = previous !== undefined && m.time < previous + duration ? previous : bars[lo];
    }
    return aligned === undefined ? [] : [{ ...m, time: aligned, eventTime: m.eventTime ?? m.time }];
  });
}
