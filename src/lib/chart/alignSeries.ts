/**
 * 多序列时间对齐与变换（index100 / pctChange / 季频 step 填充）。
 */

export type TimedValue = { time: number; value: number };

export type LayerTransform = "raw" | "index100" | "pctChange";

/** 多序列按 time 内连接；仅保留所有序列都有值的交易日 */
export function innerJoinSeries(
  seriesList: TimedValue[][],
): { time: number; values: number[] }[] {
  if (seriesList.length === 0) return [];
  const maps = seriesList.map(
    (s) => new Map(s.filter((p) => Number.isFinite(p.value)).map((p) => [p.time, p.value])),
  );
  const base = maps[0]!;
  const times = [...base.keys()].sort((a, b) => a - b);
  const out: { time: number; values: number[] }[] = [];
  for (const t of times) {
    const values: number[] = [];
    let ok = true;
    for (const m of maps) {
      const v = m.get(t);
      if (v == null || !Number.isFinite(v)) {
        ok = false;
        break;
      }
      values.push(v);
    }
    if (ok) out.push({ time: t, values });
  }
  return out;
}

/** 将表达式 AST 求值结果落到共同交易日（valuesBySymbol: symbol → TimedValue[]） */
export function evaluateExpressionOnSeries(
  symbols: string[],
  valuesBySymbol: Record<string, TimedValue[]>,
  evalAt: (vals: Record<string, number>) => number | null,
): TimedValue[] {
  const list = symbols.map((s) => valuesBySymbol[s] ?? []);
  if (list.some((s) => s.length === 0)) return [];
  const joined = innerJoinSeries(list);
  const out: TimedValue[] = [];
  for (const row of joined) {
    const vals: Record<string, number> = {};
    symbols.forEach((s, i) => {
      vals[s] = row.values[i]!;
    });
    const v = evalAt(vals);
    if (v == null || !Number.isFinite(v)) continue;
    out.push({ time: row.time, value: v });
  }
  return out;
}

/** 可见区间起点=100；若未给 fromSec 则用序列首点 */
export function applyIndex100(
  points: TimedValue[],
  fromSec?: number | null,
): TimedValue[] {
  if (!points.length) return [];
  const sorted = [...points].sort((a, b) => a.time - b.time);
  let base: number | null = null;
  for (const p of sorted) {
    if (fromSec != null && p.time < fromSec) continue;
    if (Number.isFinite(p.value) && p.value !== 0) {
      base = p.value;
      break;
    }
  }
  if (base == null || base === 0) return [];
  const start = fromSec ?? sorted[0]!.time;
  return sorted
    .filter((p) => p.time >= start)
    .map((p) => ({ time: p.time, value: (p.value / base!) * 100 }));
}

/** 相对序列首点的涨跌幅 % */
export function applyPctChange(points: TimedValue[]): TimedValue[] {
  if (!points.length) return [];
  const sorted = [...points].sort((a, b) => a.time - b.time);
  const base = sorted[0]!.value;
  if (!base) return [];
  return sorted.map((p) => ({
    time: p.time,
    value: ((p.value - base) / base) * 100,
  }));
}

export function applyTransform(
  points: TimedValue[],
  transform: LayerTransform,
  indexFromSec?: number | null,
): TimedValue[] {
  if (transform === "index100") return applyIndex100(points, indexFromSec);
  if (transform === "pctChange") return applyPctChange(points);
  return [...points].sort((a, b) => a.time - b.time);
}

const DAY_SEC = 86_400;
const REPORT_LAG_DAYS = 40;

/**
 * 季频点按「可得日 = fiscalDate + lag」向前填充到日线时间轴（step）。
 * candleTimes 为升序 epoch 秒。
 */
export function stepFillToDaily(
  quarters: { fiscalDate: string; value: number }[],
  candleTimes: number[],
  lagDays = REPORT_LAG_DAYS,
): TimedValue[] {
  if (!quarters.length || !candleTimes.length) return [];
  const avail = quarters
    .filter((q) => q.fiscalDate && Number.isFinite(q.value))
    .map((q) => ({
      fromSec:
        Math.floor(Date.parse(`${q.fiscalDate}T00:00:00Z`) / 1000) +
        lagDays * DAY_SEC,
      value: q.value,
    }))
    .sort((a, b) => a.fromSec - b.fromSec);
  if (!avail.length) return [];

  const out: TimedValue[] = [];
  let qi = -1;
  for (const t of candleTimes) {
    while (qi + 1 < avail.length && avail[qi + 1]!.fromSec <= t) qi += 1;
    if (qi < 0) continue;
    out.push({ time: t, value: avail[qi]!.value });
  }
  return out;
}

/** close 数组 → TimedValue（time 已是 number） */
export function closesToTimed(
  closes: { time: number; close: number }[],
): TimedValue[] {
  return closes
    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.close))
    .map((p) => ({ time: p.time, value: p.close }));
}
