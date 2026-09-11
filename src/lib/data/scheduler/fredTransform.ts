import type { ObservationPoint } from "./types";

export type FredSeriesTransform = "none" | "yoy_pct" | "mom_pct";

/**
 * 宏观数据库约束：库内只存 FRED 原始值，调度器不再按 code 后缀做同比等二次计算
 * （原 usov_*_yoy / fiscal_fgcec1_yoy 已退役）。同比一律在指标运算 seriesCalcConfig 中实现。
 */
export function fredTransformForInstrument(code: string): FredSeriesTransform {
  void code;
  return "none";
}

/** 由水平值序列计算同比 %（月/季/年：与 12/4/1 期前对比） */
export function applyYoYPercent(points: ObservationPoint[]): ObservationPoint[] {
  if (points.length < 2) return [];

  const sorted = [...points].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  const index = new Map<number, number>();
  for (const p of sorted) {
    index.set(p.obsDate.getTime(), p.value);
  }

  function findPriorValue(d: Date): number | null {
    const candidates = [
      new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate())),
      new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), 1)),
      new Date(Date.UTC(d.getUTCFullYear() - 1, 0, 1)),
    ];
    for (const c of candidates) {
      const v = index.get(c.getTime());
      if (v != null && v !== 0) return v;
    }
    const target = d.getTime() - 365.25 * 86_400_000;
    let best: { dt: number; v: number } | null = null;
    for (const p of sorted) {
      const t = p.obsDate.getTime();
      if (t >= target - 45 * 86_400_000 && t <= target + 45 * 86_400_000) {
        if (!best || Math.abs(t - target) < Math.abs(best.dt - target)) {
          best = { dt: t, v: p.value };
        }
      }
    }
    return best?.v ?? null;
  }

  const out: ObservationPoint[] = [];
  for (const p of sorted) {
    const prev = findPriorValue(p.obsDate);
    if (prev == null || prev === 0) continue;
    out.push({
      obsDate: p.obsDate,
      value: ((p.value / prev) - 1) * 100,
    });
  }
  return out;
}

/** 由水平值序列计算环比 %（与上一期对比） */
export function applyMomPercent(points: ObservationPoint[]): ObservationPoint[] {
  if (points.length < 2) return [];
  const sorted = [...points].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  const out: ObservationPoint[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!.value;
    const cur = sorted[i]!.value;
    if (prev === 0) continue;
    out.push({
      obsDate: sorted[i]!.obsDate,
      value: ((cur / prev) - 1) * 100,
    });
  }
  return out;
}

export function applyFredTransform(
  points: ObservationPoint[],
  transform: FredSeriesTransform,
): ObservationPoint[] {
  if (transform === "yoy_pct") return applyYoYPercent(points);
  if (transform === "mom_pct") return applyMomPercent(points);
  return points;
}
