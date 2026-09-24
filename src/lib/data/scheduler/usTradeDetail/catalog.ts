export const US_TRADE_SOURCE_ID = "us-census-trade-detail";
export const US_TRADE_PROVIDER = "us_census_trade_detail";
export const US_TRADE_PACKAGE_ID = "us.census.international_trade";

export const US_TRADE_FILES = {
  exports: "https://www.census.gov/foreign-trade/statistics/historical/exports_enduse.xlsx",
  imports: "https://www.census.gov/foreign-trade/statistics/historical/imports_enduse.xlsx",
  countries: "https://www.census.gov/foreign-trade/statistics/country/ctyseasonal.xlsx",
  countriesNsa: "https://www.census.gov/foreign-trade/balance/country.xlsx",
} as const;

export type UsTradeSeries = {
  code: string;
  label: string;
  nameEn: string;
  kind: "exports" | "imports" | "countries" | "country_nsa";
  sourceCode: string;
  subgroup: string;
  seasonalAdjustment: "SA" | "NSA";
  points: { obsDate: Date; value: number }[];
};

export function usTradePlacement(code: string): string | null {
  const product = /^census_us_trade_(exports|imports)_enduse_(\d{5}|5)$/.exec(code);
  if (product) {
    const side = product[1] === "exports" ? "出口" : "进口";
    const digit = product[2]![0];
    const group = digit === "0" ? "食品与饮料" : digit === "1" ? (Number(product[2]) < 12000 ? "工业原料·能源" : "工业原料·其他")
      : digit === "2" ? "资本品" : digit === "3" ? "汽车及零件" : digit === "4" ? "消费品" : "其他商品";
    return `贸易商品：${side}·${group}`;
  }
  if (/^census_us_trade_(exports|imports)_country_\d{4}$/.test(code)) {
    return code.includes("_exports_") ? "贸易伙伴：季调出口" : "贸易伙伴：季调进口";
  }
  const countryNsa = /^census_us_trade_(exports|imports)_country_nsa_(\d{4})$/.exec(code);
  if (countryNsa) {
    const side = countryNsa[1] === "exports" ? "出口" : "进口";
    const number = Number(countryNsa[2]);
    const region = number < 2000 ? "北美" : number < 3000 ? "中美与加勒比" : number < 4000 ? "南美"
      : number < 4500 ? "欧洲·北西" : number < 5000 ? "欧洲·南东" : number < 6000 ? "亚洲"
        : number < 7000 ? "大洋洲" : number < 7500 ? "非洲·北西" : "非洲·其他";
    return `贸易伙伴：未季调${side}·${region}`;
  }
  return null;
}
