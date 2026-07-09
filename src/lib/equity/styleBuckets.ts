/**
 * 成长 / 周期 / 防御风格篮子（首期写死，不做因子模型）。
 */

import {
  GICS_SECTORS,
  type GicsSector,
  getSectorDef,
} from "@/lib/equity/gicsCatalog";

export const STYLE_BUCKET_IDS = ["growth", "cyclical", "defensive"] as const;
export type StyleBucketId = (typeof STYLE_BUCKET_IDS)[number];

export type StyleBucketDef = {
  id: StyleBucketId;
  nameZh: string;
  nameEn: string;
  sectors: readonly GicsSector[];
};

export const STYLE_BUCKETS: readonly StyleBucketDef[] = [
  {
    id: "growth",
    nameZh: "成长",
    nameEn: "Growth",
    sectors: ["Information Technology", "Communication Services"],
  },
  {
    id: "cyclical",
    nameZh: "周期",
    nameEn: "Cyclical",
    sectors: [
      "Energy",
      "Materials",
      "Industrials",
      "Financials",
      "Consumer Discretionary",
      "Real Estate",
    ],
  },
  {
    id: "defensive",
    nameZh: "防御",
    nameEn: "Defensive",
    sectors: ["Consumer Staples", "Health Care", "Utilities"],
  },
] as const;

const SECTOR_TO_STYLE: Record<GicsSector, StyleBucketId> = (() => {
  const map = {} as Record<GicsSector, StyleBucketId>;
  for (const bucket of STYLE_BUCKETS) {
    for (const sector of bucket.sectors) {
      map[sector] = bucket.id;
    }
  }
  return map;
})();

export function styleForSector(sector: GicsSector): StyleBucketId {
  return SECTOR_TO_STYLE[sector];
}

export function getStyleBucket(id: StyleBucketId): StyleBucketDef {
  const b = STYLE_BUCKETS.find((x) => x.id === id);
  if (!b) throw new Error(`未知风格篮子: ${id}`);
  return b;
}

/** 校验：11 个 Sector 恰好各属一个风格，无遗漏无重复 */
export function assertStyleCoverageComplete(): void {
  const seen = new Set<GicsSector>();
  for (const bucket of STYLE_BUCKETS) {
    for (const sector of bucket.sectors) {
      if (seen.has(sector)) {
        throw new Error(`Sector 重复归属风格: ${sector}`);
      }
      seen.add(sector);
    }
  }
  for (const sector of GICS_SECTORS) {
    if (!seen.has(sector)) {
      throw new Error(`Sector 未归属风格: ${sector}`);
    }
  }
}

export function styleBucketEtfs(id: StyleBucketId): string[] {
  return getStyleBucket(id).sectors.map((s) => getSectorDef(s).etf);
}
