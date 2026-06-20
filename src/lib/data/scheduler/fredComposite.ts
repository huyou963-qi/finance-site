import { fetchFredIncremental } from "./adapters/fredAdapter";
import type { UsovCompositeSpec } from "./usovCompositeFred";
import type { FetchIncrementalResult, ObservationPoint } from "./types";

function byDateAsc(points: ObservationPoint[]): ObservationPoint[] {
  return [...points].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
}

function indexByDay(points: ObservationPoint[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of points) {
    m.set(p.obsDate.getTime(), p.value);
  }
  return m;
}

function combineBinary(
  a: ObservationPoint[],
  b: ObservationPoint[],
  fn: (x: number, y: number) => number | null,
): ObservationPoint[] {
  const ia = indexByDay(a);
  const ib = indexByDay(b);
  const keys = [...ia.keys()].filter((k) => ib.has(k)).sort((x, y) => x - y);
  const out: ObservationPoint[] = [];
  for (const k of keys) {
    const v = fn(ia.get(k)!, ib.get(k)!);
    if (v == null || !Number.isFinite(v)) continue;
    out.push({ obsDate: new Date(k), value: v });
  }
  return out;
}

function wowPercent(points: ObservationPoint[]): ObservationPoint[] {
  const sorted = byDateAsc(points);
  const out: ObservationPoint[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!.value;
    const cur = sorted[i]!.value;
    if (prev === 0) continue;
    out.push({
      obsDate: sorted[i]!.obsDate,
      value: ((cur - prev) / Math.abs(prev)) * 100,
    });
  }
  return out;
}

function movingAverage(points: ObservationPoint[], window: number): ObservationPoint[] {
  const sorted = byDateAsc(points);
  const out: ObservationPoint[] = [];
  for (let i = window - 1; i < sorted.length; i++) {
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) sum += sorted[j]!.value;
    out.push({ obsDate: sorted[i]!.obsDate, value: sum / window });
  }
  return out;
}

function applyComposite(spec: UsovCompositeSpec, series: Map<string, ObservationPoint[]>): ObservationPoint[] {
  if (spec.kind === "spread") {
    return combineBinary(series.get(spec.a) ?? [], series.get(spec.b) ?? [], (x, y) => x - y);
  }
  if (spec.kind === "ratio") {
    return combineBinary(series.get(spec.num) ?? [], series.get(spec.den) ?? [], (x, y) =>
      y === 0 ? null : x / y,
    );
  }
  const base = series.get(spec.series) ?? [];
  if (spec.kind === "wow_pct") return wowPercent(base);
  return movingAverage(wowPercent(base), 4);
}

function seriesIdsForSpec(spec: UsovCompositeSpec): string[] {
  if (spec.kind === "spread") return [spec.a, spec.b];
  if (spec.kind === "ratio") return [spec.num, spec.den];
  return [spec.series];
}

export async function fetchFredCompositeIncremental(
  spec: UsovCompositeSpec,
  apiKey: string,
  observationStart: string,
): Promise<FetchIncrementalResult> {
  const ids = seriesIdsForSpec(spec);
  const series = new Map<string, ObservationPoint[]>();
  let sourceLatest: Date | null = null;
  let skippedInvalid = 0;

  for (const id of ids) {
    const r = await fetchFredIncremental(id, apiKey, observationStart);
    series.set(id, r.points);
    skippedInvalid += r.skippedInvalid;
    if (r.sourceLatestObsDate && (!sourceLatest || r.sourceLatestObsDate > sourceLatest)) {
      sourceLatest = r.sourceLatestObsDate;
    }
  }

  const points = applyComposite(spec, series);
  return { points, sourceLatestObsDate: sourceLatest, skippedInvalid };
}
