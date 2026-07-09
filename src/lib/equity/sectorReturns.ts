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

/** 取区间首尾收盘价计算简单收益；不足两点返回 null */
export function simpleReturn(points: ClosePoint[], fromSec: number): number | null {
  const sorted = [...points].sort((a, b) => a.time - b.time);
  const inRange = sorted.filter((p) => p.time >= fromSec);
  const series = inRange.length >= 2 ? inRange : sorted;
  if (series.length < 2) return null;
  const first = series[0]!.close;
  const last = series[series.length - 1]!.close;
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
  return last / first - 1;
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

export function computeSectorReturns(
  closesByEtf: Record<string, ClosePoint[]>,
  windowId: ReturnWindowId,
): { sectors: SectorReturnRow[]; styles: StyleReturnRow[]; spyReturn: number | null } {
  const fromSec = windowStartSec(windowId);
  const spyReturn = simpleReturn(closesByEtf[BENCHMARK_ETF] ?? [], fromSec);

  const sectors: SectorReturnRow[] = GICS_SECTOR_DEFS.map((def) => {
    const abs = simpleReturn(closesByEtf[def.etf] ?? [], fromSec);
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
