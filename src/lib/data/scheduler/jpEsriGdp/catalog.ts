export const JP_ESRI_GDP_MENU_URL = "https://www.esri.cao.go.jp/jp/sna/menu.html";
export const JP_ESRI_GDP_SOURCE_ID = "jp-esri-gdp";
export const JP_ESRI_GDP_AGENCY_ID = "jp-esri";
export const JP_ESRI_GDP_PROVIDER = "jp_esri_gdp";
export const JP_ESRI_GDP_TERMS_URL = "https://www.cao.go.jp/en/notice-e.html";
export const JP_ESRI_GDP_TABLES = ["gaku-mk", "gaku-jk", "def-qk", "kiyo-jk"] as const;
export type EsriTable = typeof JP_ESRI_GDP_TABLES[number];
// Exact English source headers, validated on every fetch. No positional-only mapping.
export const ESRI_COMPONENTS = [
  ["gdp", "GDP(Expenditure Approach)", "GDP"],
  ["private_consumption", "PrivateConsumption", "私人最终消费"],
  ["private_residential", "PrivateResidentialInvestment", "私人住宅投资"],
  ["private_business", "Private Non-Resi.Investment", "私人非住宅投资"],
  ["private_inventories", "Changein PrivateInventories", "私人库存变动"],
  ["government_consumption", "GovernmentConsumption", "政府最终消费"],
  ["public_investment", "PublicInvestment", "公共固定资本形成"],
  ["public_inventories", "Changein PublicInventories", "公共库存变动"],
  ["net_exports", "Net Exports", "货物与服务净出口"],
  ["exports", "Exports", "货物与服务出口"],
  ["imports", "Imports", "货物与服务进口"],
] as const;
export type EsriSeries = { code: string; table: EsriTable; component: string; header: string; name: string; unit: string; category: string; subgroup: string };
export const JP_ESRI_GDP_SERIES: EsriSeries[] = JP_ESRI_GDP_TABLES.flatMap((table) => ESRI_COMPONENTS.flatMap(([component, header, label]) => {
  // Legacy jpov nominal GDP is unannualised (2026Q1 169881.5); this is SAAR (680104.3).
  if (table === "def-qk" && ["private_inventories", "public_inventories", "net_exports"].includes(component)) return [];
  const measure = table === "gaku-mk" ? "nominal_saar" : table === "gaku-jk" ? "real_saar" : table === "def-qk" ? "deflator_sa" : component === "gdp" ? "real_qoq_sa" : "real_contribution_sa";
  const description = table === "gaku-mk" ? "名义季调年率" : table === "gaku-jk" ? "实际季调年率（2020年链式价格）" : table === "def-qk" ? "季调平减指数" : component === "gdp" ? "实际季调环比" : "对实际GDP环比贡献（季调）";
  return [{ code: `esri_jp_gdp_${component}_${measure}`, table, component, header, name: `日本:${label}:${description}`,
    unit: table === "def-qk" ? "指数（2020=100）" : table === "kiyo-jk" ? component === "gdp" ? "%" : "百分点" : "十亿日元",
    category: table === "def-qk" ? "通胀与价格" : "国民经济",
    subgroup: table === "def-qk" ? "GDP平减指数" : table === "kiyo-jk" ? "GDP：实际增长与贡献" : "GDP：支出法季调年率",
  }];
}));
