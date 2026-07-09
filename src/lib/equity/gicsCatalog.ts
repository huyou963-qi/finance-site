/**
 * GICS 11 Sector 目录：SPDR ETF、中文名、FMP profile.sector normalize。
 * 依据 docs/research/US_EQUITY_INDUSTRY_RESEARCH.md
 */

export const GICS_SECTORS = [
  "Energy",
  "Materials",
  "Industrials",
  "Consumer Discretionary",
  "Consumer Staples",
  "Health Care",
  "Financials",
  "Information Technology",
  "Communication Services",
  "Utilities",
  "Real Estate",
] as const;

export type GicsSector = (typeof GICS_SECTORS)[number];

export type GicsSectorDef = {
  sector: GicsSector;
  nameZh: string;
  etf: string;
  /** FMP historical-sector-performance 常用名（多数与 GICS 一致） */
  fmpSectorName: string;
};

export const GICS_SECTOR_DEFS: readonly GicsSectorDef[] = [
  { sector: "Energy", nameZh: "能源", etf: "XLE", fmpSectorName: "Energy" },
  { sector: "Materials", nameZh: "原材料", etf: "XLB", fmpSectorName: "Basic Materials" },
  { sector: "Industrials", nameZh: "工业", etf: "XLI", fmpSectorName: "Industrials" },
  {
    sector: "Consumer Discretionary",
    nameZh: "可选消费",
    etf: "XLY",
    fmpSectorName: "Consumer Cyclical",
  },
  {
    sector: "Consumer Staples",
    nameZh: "必需消费",
    etf: "XLP",
    fmpSectorName: "Consumer Defensive",
  },
  { sector: "Health Care", nameZh: "医疗保健", etf: "XLV", fmpSectorName: "Healthcare" },
  { sector: "Financials", nameZh: "金融", etf: "XLF", fmpSectorName: "Financial Services" },
  {
    sector: "Information Technology",
    nameZh: "信息技术",
    etf: "XLK",
    fmpSectorName: "Technology",
  },
  {
    sector: "Communication Services",
    nameZh: "通信服务",
    etf: "XLC",
    fmpSectorName: "Communication Services",
  },
  { sector: "Utilities", nameZh: "公用事业", etf: "XLU", fmpSectorName: "Utilities" },
  { sector: "Real Estate", nameZh: "房地产", etf: "XLRE", fmpSectorName: "Real Estate" },
];

/** FMP / 别名 → 标准 GICS Sector */
const SECTOR_ALIASES: Record<string, GicsSector> = {
  energy: "Energy",
  materials: "Materials",
  "basic materials": "Materials",
  industrials: "Industrials",
  "consumer discretionary": "Consumer Discretionary",
  "consumer cyclical": "Consumer Discretionary",
  "consumer staples": "Consumer Staples",
  "consumer defensive": "Consumer Staples",
  "health care": "Health Care",
  healthcare: "Health Care",
  financials: "Financials",
  "financial services": "Financials",
  financial: "Financials",
  "information technology": "Information Technology",
  technology: "Information Technology",
  tech: "Information Technology",
  "communication services": "Communication Services",
  "communications": "Communication Services",
  utilities: "Utilities",
  "real estate": "Real Estate",
};

export function isGicsSector(value: string): value is GicsSector {
  return (GICS_SECTORS as readonly string[]).includes(value);
}

/** 将 Wikipedia / FMP 等来源的 sector 字符串规范为 GICS 11 */
export function normalizeGicsSector(raw: string | null | undefined): GicsSector | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isGicsSector(trimmed)) return trimmed;
  const key = trimmed.toLowerCase().replace(/\s+/g, " ");
  return SECTOR_ALIASES[key] ?? null;
}

export function getSectorDef(sector: GicsSector): GicsSectorDef {
  const def = GICS_SECTOR_DEFS.find((d) => d.sector === sector);
  if (!def) throw new Error(`未知 GICS Sector: ${sector}`);
  return def;
}

export function sectorSlug(sector: GicsSector): string {
  return sector
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function sectorFromSlug(slug: string): GicsSector | null {
  const normalized = slug.trim().toLowerCase();
  for (const s of GICS_SECTORS) {
    if (sectorSlug(s) === normalized) return s;
  }
  return normalizeGicsSector(slug.replace(/-/g, " "));
}

export const SECTOR_ETF_SYMBOLS: readonly string[] = GICS_SECTOR_DEFS.map((d) => d.etf);

export const BENCHMARK_ETF = "SPY";
