/**
 * 将当前 K 线标的展开为事件查询上下文，并提供显式标签匹配。
 */

import { prisma } from "@/lib/prisma";
import { GICS_SECTOR_CODES } from "@/lib/data/eventTaxonomy";
import {
  classifyChartSymbol,
  type ChartSymbolProfile,
} from "@/lib/data/chartSymbolProfile";
import {
  getSectorDef,
  normalizeGicsSector,
  type GicsSector,
} from "@/lib/equity/gicsCatalog";
import { normalizeAssetTag } from "@/lib/data/marketEvents";
import { normalizeIndustryTag } from "@/lib/data/eventTaxonomy";

/** @deprecated 上卷范围已由显式 tags 取代；保留解析兼容旧 query */
export type EventExpandLevel = "symbol" | "industry" | "country";

export type AssetEventContext = {
  symbol: string;
  assets: string[];
  industries: string[];
  countries: string[];
  relatedAssets: string[];
  expand: EventExpandLevel;
};

export type ExplicitEventTagFilters = {
  assets?: string[];
  industries?: string[];
  countries?: string[];
};

const EXPAND_RANK: Record<EventExpandLevel, number> = {
  symbol: 0,
  industry: 1,
  country: 2,
};

export function parseExpandLevel(raw: string | null | undefined): EventExpandLevel {
  const s = (raw ?? "symbol").trim().toLowerCase();
  if (s === "industry" || s === "country" || s === "symbol") return s;
  return "symbol";
}

export type EventScopeMode = "follow" | "range";

/** 已取消「时间轴全部」；读到 range/旧值一律当 follow */
export function parseScopeMode(_raw?: string | null): EventScopeMode {
  return "follow";
}

function industriesFromEquityRow(sec: {
  gicsSector: string | null;
  gicsIndustryCode: string | null;
}): string[] {
  const industries: string[] = [];
  if (sec.gicsIndustryCode?.trim()) {
    const code = sec.gicsIndustryCode.trim();
    industries.push(code);
    if (code.length >= 2) industries.push(code.slice(0, 2));
    if (code.length >= 4) industries.push(code.slice(0, 4));
  }
  const sector = normalizeGicsSector(sec.gicsSector);
  if (sector) {
    const code = GICS_SECTOR_CODES[sector as GicsSector];
    if (code && !industries.includes(code)) industries.push(code);
  }
  return [...new Set(industries)];
}

/** 服务端补全个股 GICS industries */
export async function enrichChartSymbolProfile(
  profile: ChartSymbolProfile,
): Promise<ChartSymbolProfile> {
  if (profile.kind !== "equity" && profile.kind !== "unknown") return profile;
  const sec = await prisma.equitySecurity.findUnique({
    where: { symbol: profile.symbol },
    select: { gicsSector: true, gicsIndustryCode: true },
  });
  if (!sec) {
    return { ...profile, kind: profile.kind === "equity" ? "unknown" : profile.kind };
  }
  return {
    ...profile,
    kind: "equity",
    kindLabel: "个股",
    industries: industriesFromEquityRow(sec),
  };
}

export async function resolveChartSymbolProfile(
  symbolRaw: string,
): Promise<ChartSymbolProfile> {
  return enrichChartSymbolProfile(classifyChartSymbol(symbolRaw));
}

/**
 * 将当前 K 线标的展开为事件查询上下文。
 * 美股默认 country=US；行业来自 EquitySecurity GICS。
 * @deprecated 新逻辑优先用显式 tags + eventHitsExplicitFilters
 */
export async function resolveAssetEventContext(
  symbolRaw: string,
  expand: EventExpandLevel = "symbol",
): Promise<AssetEventContext> {
  const profile = await resolveChartSymbolProfile(symbolRaw);
  const relatedAssets: string[] = [];

  if (profile.gicsSector) {
    try {
      const def = getSectorDef(profile.gicsSector);
      if (def.etf) relatedAssets.push(def.etf);
    } catch {
      /* ignore */
    }
  } else if (profile.kind === "equity" && profile.industries.length) {
    const sectorCode = profile.industries.find((c) => c.length === 2);
    if (sectorCode) {
      const sector = (Object.entries(GICS_SECTOR_CODES).find(
        ([, code]) => code === sectorCode,
      )?.[0] ?? null) as GicsSector | null;
      if (sector) {
        try {
          const def = getSectorDef(sector);
          if (def.etf) relatedAssets.push(def.etf);
        } catch {
          /* ignore */
        }
      }
    }
  }

  return {
    symbol: profile.symbol,
    assets: [profile.symbol],
    industries: profile.industries,
    countries: profile.countries.length ? profile.countries : ["US"],
    relatedAssets,
    expand,
  };
}

function industryHit(eventIndustries: string[], want: string[]): boolean {
  if (!want.length || !eventIndustries.length) return false;
  const wantN = want.map(normalizeIndustryTag);
  return eventIndustries.some((ind) => {
    const e = normalizeIndustryTag(ind);
    return wantN.some((w) => e === w || e.startsWith(w) || w.startsWith(e));
  });
}

/**
 * 显式标签匹配：
 * - 相关维（资产、行业）：OR，至少命中其一
 * - 收窄维（国家）：非空则 AND，不能单独打开集合
 * - 相关维皆空且提供 fallbackAsset 时，回退为该资产
 * - 相关维皆空且无 fallback：不过滤（兼容非图表上下文）
 */
export function eventHitsExplicitFilters(
  event: {
    assets: string[];
    industries: string[];
    countries: string[];
  },
  filters: ExplicitEventTagFilters,
  opts?: { fallbackAsset?: string | null },
): boolean {
  let assets = (filters.assets ?? []).map(normalizeAssetTag).filter(Boolean);
  const industries = (filters.industries ?? []).filter(Boolean);
  const countries = (filters.countries ?? []).filter(Boolean);

  if (!assets.length && !industries.length && opts?.fallbackAsset?.trim()) {
    assets = [normalizeAssetTag(opts.fallbackAsset)];
  }

  const hasRelevance = assets.length > 0 || industries.length > 0;
  if (hasRelevance) {
    let rel = false;
    if (assets.length) {
      const assetSet = new Set(assets);
      rel = event.assets.some((a) => assetSet.has(normalizeAssetTag(a)));
    }
    if (!rel && industries.length) {
      rel = industryHit(event.industries, industries);
    }
    if (!rel) return false;
  }

  if (countries.length) {
    if (
      !event.countries.length ||
      !event.countries.some((c) => countries.includes(c))
    ) {
      return false;
    }
  }

  return true;
}

/** 按 expand 级别判断 MarketEvent 是否命中当前标的上下文 */
export function eventHitsAssetContext(
  event: {
    assets: string[];
    industries: string[];
    countries: string[];
  },
  ctx: AssetEventContext,
): boolean {
  const assetSet = new Set(ctx.assets.map(normalizeAssetTag));
  if (event.assets.some((a) => assetSet.has(normalizeAssetTag(a)))) return true;

  if (EXPAND_RANK[ctx.expand] >= EXPAND_RANK.industry) {
    if (event.industries.length && ctx.industries.length) {
      if (industryHit(event.industries, ctx.industries)) return true;
    }
  }

  if (EXPAND_RANK[ctx.expand] >= EXPAND_RANK.country) {
    if (event.countries.length && ctx.countries.length) {
      if (event.countries.some((c) => ctx.countries.includes(c))) return true;
    }
  }

  return false;
}
