export const JP_METI_IIP_URL = "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040172363&fileKind=0";
export const JP_METI_IIP_PAGE = "https://www.e-stat.go.jp/stat-search/files?layout=dataset&stat_infid=000040172363";
export const JP_METI_IIP_PROVIDER = "jp_meti_iip";
export const JP_METI_IIP_SOURCE_ID = "jp-meti-iip";
export const JP_METI_IIP_SERIES = [
  { instrumentCode: "meti_jp_iip_production_sa", sheet: "生産", label: "工业生产指数（季调）" },
  { instrumentCode: "meti_jp_iip_shipments_sa", sheet: "出荷", label: "工业出货指数（季调）" },
  { instrumentCode: "meti_jp_iip_inventories_sa", sheet: "在庫", label: "工业库存指数（季调）" },
  { instrumentCode: "meti_jp_iip_inventory_ratio_sa", sheet: "在庫率", label: "工业库存率指数（季调）" },
] as const;
export type JpMetiIipSeries = (typeof JP_METI_IIP_SERIES)[number];
