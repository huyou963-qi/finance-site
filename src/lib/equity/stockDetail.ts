/**
 * 个股详情共享上下文：主档 + GICS 归属（面包屑）+ 同 Industry 成分。
 * 供 /equity/stocks/[symbol] 页面与 /api/equity/stocks/[symbol]/* 路由复用。
 */

import { prisma } from "@/lib/prisma";
import {
  getSectorDef,
  isGicsSector,
  normalizeGicsSector,
  sectorSlug,
  type GicsSector,
  type GicsSectorDef,
} from "@/lib/equity/gicsCatalog";
import {
  getIndustryByCode,
  industrySlug,
  type GicsIndustry,
} from "@/lib/equity/gicsIndustryCatalog";
import { listConstituentsByIndustry } from "@/lib/equity/equitySecurities";

export type StockContext = {
  symbol: string;
  name: string;
  cik: string | null;
  marketCap: number | null;
  marketCapAsOf: string | null;
  website: string | null;
  gicsSubIndustry: string | null;
  sector: GicsSector;
  sectorDef: GicsSectorDef;
  sectorSlug: string;
  industry: GicsIndustry | null;
  industrySlug: string | null;
  /** 同 Industry 成分（含自身，按市值降序）；无 Industry 归属时为空 */
  peerSymbols: string[];
};

export function normalizeSymbolParam(raw: string): string | null {
  const sym = decodeURIComponent(raw).trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,16}$/.test(sym)) return null;
  return sym;
}

export async function loadStockContext(symbolRaw: string): Promise<StockContext | null> {
  const symbol = normalizeSymbolParam(symbolRaw);
  if (!symbol) return null;

  const row = await prisma.equitySecurity.findUnique({ where: { symbol } });
  if (!row) return null;

  const sector = isGicsSector(row.gicsSector)
    ? row.gicsSector
    : normalizeGicsSector(row.gicsSector);
  if (!sector) return null;

  const industry = row.gicsIndustryCode ? (getIndustryByCode(row.gicsIndustryCode) ?? null) : null;
  const peers = industry
    ? await listConstituentsByIndustry(sector, industry.code, { limit: 600 })
    : [];

  return {
    symbol: row.symbol,
    name: row.name,
    cik: row.cik,
    marketCap: row.marketCap,
    marketCapAsOf: row.marketCapAsOf ? row.marketCapAsOf.toISOString().slice(0, 10) : null,
    website: row.website,
    gicsSubIndustry: row.gicsSubIndustry,
    sector,
    sectorDef: getSectorDef(sector),
    sectorSlug: sectorSlug(sector),
    industry,
    industrySlug: industry ? industrySlug(industry.nameEn) : null,
    peerSymbols: peers.map((p) => p.symbol),
  };
}

/** 区间自然日跨度 → 需要的交易日 limit（给 db-first 读取层） */
export function tradingDayLimitForRange(
  fromSec: number,
  nowSec = Math.floor(Date.now() / 1000),
): number {
  const calendarDays = Math.max(1, Math.ceil((nowSec - fromSec) / 86400));
  const tradingDays = Math.ceil(calendarDays * (5 / 7)) + 15;
  return Math.min(Math.max(tradingDays, 30), 1300);
}
