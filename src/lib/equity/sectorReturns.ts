/**
 * Sector ETF 相对收益与风格篮子聚合。
 */

import { BENCHMARK_ETF, GICS_SECTOR_DEFS, type GicsSector } from "@/lib/equity/gicsCatalog";
import { STYLE_BUCKETS, styleForSector, type StyleBucketId } from "@/lib/equity/styleBuckets";

export type ReturnWindowId = "1M" | "3M" | "6M" | "YTD" | "1Y";

export const RETURN_WINDOWS: readonly { id: ReturnWindowId; labelZh: string; days: number | "ytd" }[] =
  [
    { id: "1M", labelZh: "1个月", days: 21 },
    { id: "3M", labelZh: "3个月", days: 63 },
    { id: "6M", labelZh: "6个月", days: 126 },
    { id: "YTD", labelZh: "年初至今", days: "ytd" },
    { id: "1Y", labelZh: "1年", days: 252 },
  ];

export type ClosePoint = { time: number; close: number };

export function windowStartSec(
  windowId: ReturnWindowId,
  nowSec = Math.floor(Date.now() / 1000),
): number {
  const def = RETURN_WINDOWS.find((w) => w.id === windowId);
  if (!def) return nowSec - 63 * 86400;
  if (def.days === "ytd") {
    const d = new Date(nowSec * 1000);
    return Date.UTC(d.getUTCFullYear(), 0, 1) / 1000;
  }
  return nowSec - def.days * 86400;
}

function sortedCloses(points: ClosePoint[]): ClosePoint[] {
  return [...points].sort((a, b) => a.time - b.time);
}

/** 取 >= fromSec 的首个收盘；若无则取全序列第一个 */
function closeOnOrAfter(sorted: ClosePoint[], fromSec: number): ClosePoint | null {
  for (const p of sorted) {
    if (p.time >= fromSec) return p;
  }
  return sorted[0] ?? null;
}

/** 取 <= toSec 的最后一个收盘；若无则取全序列最后一个 */
function closeOnOrBefore(sorted: ClosePoint[], toSec: number): ClosePoint | null {
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    if (p.time <= toSec) return p;
  }
  return sorted[sorted.length - 1] ?? null;
}

/**
 * 取区间首尾收盘价计算简单收益。
 * - 仅 fromSec：从 fromSec 起至序列末
 * - fromSec + toSec：起止日各自就近交易日收盘
 */
export function simpleReturn(
  points: ClosePoint[],
  fromSec: number,
  toSec?: number,
): number | null {
  const sorted = sortedCloses(points);
  if (sorted.length < 2) return null;

  if (toSec == null) {
    const inRange = sorted.filter((p) => p.time >= fromSec);
    const series = inRange.length >= 2 ? inRange : sorted;
    if (series.length < 2) return null;
    const first = series[0]!.close;
    const last = series[series.length - 1]!.close;
    if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
    return last / first - 1;
  }

  if (toSec < fromSec) return null;
  const start = closeOnOrAfter(sorted, fromSec);
  const end = closeOnOrBefore(sorted, toSec);
  if (!start || !end || end.time < start.time) return null;
  if (!Number.isFinite(start.close) || !Number.isFinite(end.close) || start.close === 0) {
    return null;
  }
  return end.close / start.close - 1;
}

/** YYYY-MM-DD → UTC 日初秒 */
export function dateToUtcSec(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/** UTC 秒 → YYYY-MM-DD */
export function utcSecToDate(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

/** 归一化净值（起点=100） */
export function normalizeNav(points: ClosePoint[], fromSec: number): { time: number; value: number }[] {
  const sorted = [...points]
    .filter((p) => p.time >= fromSec)
    .sort((a, b) => a.time - b.time);
  if (sorted.length === 0) return [];
  const base = sorted[0]!.close;
  if (!base) return [];
  return sorted.map((p) => ({ time: p.time, value: (p.close / base) * 100 }));
}

export type SectorReturnRow = {
  sector: GicsSector;
  etf: string;
  style: StyleBucketId;
  absoluteReturn: number | null;
  excessVsSpy: number | null;
};

export type StyleReturnRow = {
  id: StyleBucketId;
  nameZh: string;
  equalWeightReturn: number | null;
  equalWeightExcess: number | null;
  memberCount: number;
};

export function computeSectorReturnsForRange(
  closesByEtf: Record<string, ClosePoint[]>,
  fromSec: number,
  toSec?: number,
): { sectors: SectorReturnRow[]; styles: StyleReturnRow[]; spyReturn: number | null } {
  const spyReturn = simpleReturn(closesByEtf[BENCHMARK_ETF] ?? [], fromSec, toSec);

  const sectors: SectorReturnRow[] = GICS_SECTOR_DEFS.map((def) => {
    const abs = simpleReturn(closesByEtf[def.etf] ?? [], fromSec, toSec);
    return {
      sector: def.sector,
      etf: def.etf,
      style: styleForSector(def.sector),
      absoluteReturn: abs,
      excessVsSpy:
        abs != null && spyReturn != null ? abs - spyReturn : abs != null ? abs : null,
    };
  });

  const styles: StyleReturnRow[] = STYLE_BUCKETS.map((bucket) => {
    const members = sectors.filter((s) => s.style === bucket.id);
    const absVals = members
      .map((m) => m.absoluteReturn)
      .filter((v): v is number => v != null);
    const excessVals = members
      .map((m) => m.excessVsSpy)
      .filter((v): v is number => v != null);
    const avg = (xs: number[]) =>
      xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    return {
      id: bucket.id,
      nameZh: bucket.nameZh,
      equalWeightReturn: avg(absVals),
      equalWeightExcess: avg(excessVals),
      memberCount: members.length,
    };
  });

  return { sectors, styles, spyReturn };
}

export function computeSectorReturns(
  closesByEtf: Record<string, ClosePoint[]>,
  windowId: ReturnWindowId,
): { sectors: SectorReturnRow[]; styles: StyleReturnRow[]; spyReturn: number | null } {
  return computeSectorReturnsForRange(closesByEtf, windowStartSec(windowId));
}
