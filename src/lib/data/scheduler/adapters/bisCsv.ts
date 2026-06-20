import type { ObservationPoint } from "../types";

/** BIS CSV TIME_PERIOD → Date（支持 2024-Q1、2024、2024-01） */
export function parseBisTimePeriod(period: string): Date | null {
  const s = period.trim();
  const q = /^(\d{4})-Q([1-4])$/i.exec(s);
  if (q) {
    const month = (Number(q[2]) - 1) * 3;
    return new Date(Date.UTC(Number(q[1]), month, 1));
  }
  const ym = /^(\d{4})-(\d{2})$/.exec(s);
  if (ym) {
    return new Date(Date.UTC(Number(ym[1]), Number(ym[2]) - 1, 1));
  }
  const y = /^(\d{4})$/.exec(s);
  if (y) {
    return new Date(Date.UTC(Number(y[1]), 0, 1));
  }
  return null;
}

/** 解析 BIS CSV 全部观测行 */
export function parseBisCsvObservations(text: string): ObservationPoint[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0]!.split(",");
  const timeIdx = header.indexOf("TIME_PERIOD");
  const valIdx = header.indexOf("OBS_VALUE");
  if (timeIdx < 0 || valIdx < 0) return [];

  const points: ObservationPoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(",");
    const value = Number(cols[valIdx]);
    const period = cols[timeIdx]?.trim() ?? "";
    if (!Number.isFinite(value) || !period) continue;
    const obsDate = parseBisTimePeriod(period);
    if (!obsDate) continue;
    points.push({ obsDate, value });
  }

  points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  return points;
}

export function parseBisSeriesKey(sourceSeriesKey: string): {
  flowId: string;
  seriesKey: string;
} | null {
  const i = sourceSeriesKey.indexOf(":");
  if (i <= 0) return null;
  const flowId = sourceSeriesKey.slice(0, i).trim();
  const seriesKey = sourceSeriesKey.slice(i + 1).trim();
  if (!flowId || !seriesKey) return null;
  return { flowId, seriesKey };
}
