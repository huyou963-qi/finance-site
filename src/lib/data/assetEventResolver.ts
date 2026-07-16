import { prisma } from "@/lib/prisma";
import { GICS_SECTOR_CODES } from "@/lib/data/eventTaxonomy";
import {
  getSectorDef,
  normalizeGicsSector,
  type GicsSector,
} from "@/lib/equity/gicsCatalog";
import { normalizeAssetTag } from "@/lib/data/marketEvents";

export type EventExpandLevel = "symbol" | "industry" | "country";

export type AssetEventContext = {
  symbol: string;
  assets: string[];
  industries: string[];
  countries: string[];
  relatedAssets: string[];
  expand: EventExpandLevel;
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

/**
 * 将当前 K 线标的展开为事件查询上下文。
 * 美股默认 country=US；行业来自 EquitySecurity GICS。
 */
export async function resolveAssetEventContext(
  symbolRaw: string,
  expand: EventExpandLevel = "symbol",
): Promise<AssetEventContext> {
  const symbol = normalizeAssetTag(symbolRaw);
  const industries: string[] = [];
  const countries: string[] = ["US"];
  const relatedAssets: string[] = [];

  const sec = await prisma.equitySecurity.findUnique({
    where: { symbol },
    select: {
      gicsSector: true,
      gicsIndustryCode: true,
    },
  });

  if (sec?.gicsIndustryCode?.trim()) {
    const code = sec.gicsIndustryCode.trim();
    industries.push(code);
    if (code.length >= 2) industries.push(code.slice(0, 2));
    if (code.length >= 4) industries.push(code.slice(0, 4));
  }

  const sector = normalizeGicsSector(sec?.gicsSector);
  if (sector) {
    const code = GICS_SECTOR_CODES[sector as GicsSector];
    if (code && !industries.includes(code)) industries.push(code);
    try {
      const def = getSectorDef(sector);
      if (def.etf) relatedAssets.push(def.etf);
    } catch {
      /* ignore */
    }
  }

  return {
    symbol,
    assets: [symbol],
    industries: [...new Set(industries)],
    countries,
    relatedAssets,
    expand,
  };
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
      const hit = event.industries.some((ei) =>
        ctx.industries.some((ci) => ei === ci || ei.startsWith(ci) || ci.startsWith(ei)),
      );
      if (hit) return true;
    }
  }

  if (EXPAND_RANK[ctx.expand] >= EXPAND_RANK.country) {
    if (event.countries.length && ctx.countries.length) {
      if (event.countries.some((c) => ctx.countries.includes(c))) return true;
    }
  }

  return false;
}
