/** Managed Money COT 品种目录（不含 Brent ICE、Gas Oil ICE） */

export type CotSector = "energy" | "metals" | "grains" | "softs" | "livestock";

export type CotMatchMode = "single_max_oi" | "aggregate_markets";

export type CotProductDef = {
  slug: string;
  label: string;
  sector: CotSector;
  sectorLabel: string;
  sortOrder: number;
  match: {
    mode: CotMatchMode;
    commodityPatterns: string[];
    marketPatterns: string[];
    excludeMarketPatterns?: string[];
    /** aggregate_markets：按市场名子串匹配后按 report_date 加总 */
    exactMarketSubstrings?: string[];
  };
};

export const COT_SECTOR_LABELS: Record<CotSector, string> = {
  energy: "能源",
  metals: "金属",
  grains: "谷物",
  softs: "软商品",
  livestock: "畜牧",
};

export const COT_MM_PRODUCTS: readonly CotProductDef[] = [
  {
    slug: "wti_cme",
    label: "WTI Crude (CME)",
    sector: "energy",
    sectorLabel: COT_SECTOR_LABELS.energy,
    sortOrder: 10,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["CRUDE OIL", "WTI"],
      marketPatterns: ["NEW YORK MERCANTILE", "WTI-PHYSICAL", "LIGHT SWEET"],
      excludeMarketPatterns: ["ICE", "BRENT", "MICRO"],
    },
  },
  {
    slug: "wti_ice",
    label: "WTI Crude (ICE)",
    sector: "energy",
    sectorLabel: COT_SECTOR_LABELS.energy,
    sortOrder: 20,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["CRUDE OIL"],
      marketPatterns: ["ICE FUTURES EUROPE"],
    },
  },
  {
    slug: "rbob",
    label: "RBOB Gasoline",
    sector: "energy",
    sectorLabel: COT_SECTOR_LABELS.energy,
    sortOrder: 30,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["GASOLINE"],
      marketPatterns: ["GASOLINE RBOB", "NEW YORK MERCANTILE"],
    },
  },
  {
    slug: "ulsd",
    label: "NY Harbor ULSD",
    sector: "energy",
    sectorLabel: COT_SECTOR_LABELS.energy,
    sortOrder: 40,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["HEATING OIL", "ULSD"],
      marketPatterns: ["NY HARBOR ULSD", "NEW YORK MERCANTILE"],
    },
  },
  {
    slug: "natgas4",
    label: "NatGas (4 contr.)",
    sector: "energy",
    sectorLabel: COT_SECTOR_LABELS.energy,
    sortOrder: 50,
    match: {
      mode: "aggregate_markets",
      commodityPatterns: ["NATURAL GAS"],
      marketPatterns: [],
      exactMarketSubstrings: [
        "HENRY HUB PENULTIMATE NAT GAS - NEW YORK MERCANTILE EXCHANGE",
        "HENRY HUB LAST DAY FIN - NEW YORK MERCANTILE EXCHANGE",
        "HENRY HUB PENULTIMATE FIN - NEW YORK MERCANTILE EXCHANGE",
        "HENRY HUB INDEX - ICE FUTURES ENERGY DIV",
      ],
    },
  },
  {
    slug: "gold",
    label: "Gold",
    sector: "metals",
    sectorLabel: COT_SECTOR_LABELS.metals,
    sortOrder: 60,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["^GOLD$"],
      marketPatterns: ["COMMODITY EXCHANGE"],
      excludeMarketPatterns: ["MICRO"],
    },
  },
  {
    slug: "silver",
    label: "Silver",
    sector: "metals",
    sectorLabel: COT_SECTOR_LABELS.metals,
    sortOrder: 70,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["SILVER"],
      marketPatterns: ["COMMODITY EXCHANGE"],
    },
  },
  {
    slug: "platinum",
    label: "Platinum",
    sector: "metals",
    sectorLabel: COT_SECTOR_LABELS.metals,
    sortOrder: 80,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["PLATINUM"],
      marketPatterns: ["NEW YORK MERCANTILE"],
    },
  },
  {
    slug: "palladium",
    label: "Palladium",
    sector: "metals",
    sectorLabel: COT_SECTOR_LABELS.metals,
    sortOrder: 90,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["PALLADIUM"],
      marketPatterns: ["NEW YORK MERCANTILE"],
    },
  },
  {
    slug: "copper",
    label: "HG Copper",
    sector: "metals",
    sectorLabel: COT_SECTOR_LABELS.metals,
    sortOrder: 100,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["COPPER"],
      marketPatterns: ["COMMODITY EXCHANGE"],
    },
  },
  {
    slug: "soybeans",
    label: "Soybeans",
    sector: "grains",
    sectorLabel: COT_SECTOR_LABELS.grains,
    sortOrder: 110,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["^SOYBEANS$"],
      marketPatterns: ["CHICAGO BOARD OF TRADE"],
    },
  },
  {
    slug: "soybean_meal",
    label: "Soybean Meal",
    sector: "grains",
    sectorLabel: COT_SECTOR_LABELS.grains,
    sortOrder: 120,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["SOYBEAN MEAL"],
      marketPatterns: ["CHICAGO BOARD OF TRADE"],
    },
  },
  {
    slug: "soybean_oil",
    label: "Soybean Oil",
    sector: "grains",
    sectorLabel: COT_SECTOR_LABELS.grains,
    sortOrder: 130,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["SOYBEAN OIL"],
      marketPatterns: ["CHICAGO BOARD OF TRADE"],
    },
  },
  {
    slug: "corn",
    label: "Corn",
    sector: "grains",
    sectorLabel: COT_SECTOR_LABELS.grains,
    sortOrder: 140,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["^CORN$"],
      marketPatterns: ["CHICAGO BOARD OF TRADE"],
    },
  },
  {
    slug: "wheat_cbot",
    label: "Wheat (CBOT)",
    sector: "grains",
    sectorLabel: COT_SECTOR_LABELS.grains,
    sortOrder: 150,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["WHEAT"],
      marketPatterns: ["WHEAT-SRW"],
    },
  },
  {
    slug: "wheat_kcbt",
    label: "Wheat (KCBT)",
    sector: "grains",
    sectorLabel: COT_SECTOR_LABELS.grains,
    sortOrder: 160,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["WHEAT"],
      marketPatterns: ["WHEAT-HRW"],
    },
  },
  {
    slug: "sugar",
    label: "Sugar",
    sector: "softs",
    sectorLabel: COT_SECTOR_LABELS.softs,
    sortOrder: 170,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["SUGAR"],
      marketPatterns: ["ICE FUTURES U.S.", "SUGAR NO. 11"],
    },
  },
  {
    slug: "cocoa",
    label: "Cocoa NYBOT",
    sector: "softs",
    sectorLabel: COT_SECTOR_LABELS.softs,
    sortOrder: 180,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["COCOA"],
      marketPatterns: ["ICE FUTURES U.S."],
    },
  },
  {
    slug: "coffee",
    label: "Coffee Arabica",
    sector: "softs",
    sectorLabel: COT_SECTOR_LABELS.softs,
    sortOrder: 190,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["COFFEE"],
      marketPatterns: ["COFFEE C", "ICE FUTURES U.S."],
    },
  },
  {
    slug: "cotton",
    label: "Cotton",
    sector: "softs",
    sectorLabel: COT_SECTOR_LABELS.softs,
    sortOrder: 200,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["COTTON"],
      marketPatterns: ["ICE FUTURES U.S.", "COTTON NO. 2"],
    },
  },
  {
    slug: "live_cattle",
    label: "Live Cattle",
    sector: "livestock",
    sectorLabel: COT_SECTOR_LABELS.livestock,
    sortOrder: 210,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["LIVE CATTLE"],
      marketPatterns: ["CHICAGO MERCANTILE"],
    },
  },
  {
    slug: "feeder_cattle",
    label: "Feeder Cattle",
    sector: "livestock",
    sectorLabel: COT_SECTOR_LABELS.livestock,
    sortOrder: 220,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["FEEDER CATTLE"],
      marketPatterns: ["CHICAGO MERCANTILE"],
    },
  },
  {
    slug: "lean_hogs",
    label: "Lean Hogs",
    sector: "livestock",
    sectorLabel: COT_SECTOR_LABELS.livestock,
    sortOrder: 230,
    match: {
      mode: "single_max_oi",
      commodityPatterns: ["LEAN HOGS", "HOGS"],
      marketPatterns: ["CHICAGO MERCANTILE"],
    },
  },
] as const;

export const COT_PRODUCT_BY_SLUG = new Map(COT_MM_PRODUCTS.map((p) => [p.slug, p]));

export type CotMetric = "long" | "short";

export function cotInstrumentCode(slug: string, metric: CotMetric): string {
  return `cot_mm_${slug}_${metric}`;
}

export function cotMetricFromCode(code: string): CotMetric | null {
  if (code.endsWith("_long")) return "long";
  if (code.endsWith("_short")) return "short";
  return null;
}

export function cotSlugFromCode(code: string): string | null {
  const m = /^cot_mm_(.+)_(long|short)$/.exec(code);
  return m?.[1] ?? null;
}
