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

export function parseScopeMode(raw: string | null | undefined): EventScopeMode {
  const s = (raw ?? "follow").trim().toLowerCase();
  if (s === "range" || s === "chart") {
    // chart 兼容旧 mode=chart → follow
    return s === "range" ? "range" : "follow";
  }
  if (s === "follow") return "follow";
  // 旧 mode=symbol → follow（由显式 assets 表达）
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
 * 显式标签匹配（follow 模式）：任一非空维度命中即可；全空则不过滤。
 */
export function eventHitsExplicitFilters(
  event: {
    assets: string[];
    industries: string[];
    countries: string[];
  },
  filters: ExplicitEventTagFilters,
): boolean {
  const assets = (filters.assets ?? []).map(normalizeAssetTag).filter(Boolean);
  const industries = (filters.industries ?? []).filter(Boolean);
  const countries = (filters.countries ?? []).filter(Boolean);

  const dims: boolean[] = [];
  if (assets.length) {
    const assetSet = new Set(assets);
    dims.push(event.assets.some((a) => assetSet.has(normalizeAssetTag(a))));
  }
  if (industries.length) {
    dims.push(industryHit(event.industries, industries));
  }
  if (countries.length) {
    dims.push(
      event.countries.length > 0 &&
        event.countries.some((c) => countries.includes(c)),
    );
  }
  if (!dims.length) return true;
  return dims.some(Boolean);
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
