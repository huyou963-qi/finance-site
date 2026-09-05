/** ISM 官网 PMI 报告 + 发布日历（一手源） */

export const ISM_OFFICIAL_CALENDAR_URL =
  "https://www.ismworld.org/supply-management-news-and-reports/reports/rob-report-calendar/";

export const ISM_OFFICIAL_REPORTS_INDEX_URL =
  "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/";

export const ISM_OFFICIAL_MFG_REPORT_URL_TEMPLATE =
  "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/pmi/{month}/";

export const ISM_OFFICIAL_SVC_REPORT_URL_TEMPLATE =
  "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/services/{month}/";

export const ISM_OFFICIAL_SYNC_SCRIPT = "scripts/data-worker/sync-ism-official.ts";

/**
 * PR Newswire 公开发布 ISM 新闻稿（不受官网 SSO 墙影响，robots.txt 无 disallow）。
 * 新闻稿正文内嵌与官网相同的 "AT A GLANCE" 表，分项覆盖比 TE 更全，
 * 因此官网失败时优先兜底 PR Newswire，PR Newswire 也失败/无该分项时再退到 TE。
 */
export const PR_NEWSWIRE_ISM_LIST_URL =
  "https://www.prnewswire.com/news/institute-for-supply-management/";

export const ISM_OFFICIAL_SOURCE = {
  id: "ism-official",
  agencyId: "us-ism",
  name: "ISM PMI Reports",
  nameZh: "美国供应管理协会",
  nameEn: "Institute for Supply Management",
  baseUrl: ISM_OFFICIAL_REPORTS_INDEX_URL,
  termsUrl: ISM_OFFICIAL_REPORTS_INDEX_URL,
  websiteUrl: "https://www.ismworld.org/",
} as const;

export const ISM_OFFICIAL_PACKAGE_IDS = {
  manufacturing: "us.ism.manufacturing",
  services: "us.ism.services",
} as const;

export type IsmOfficialReportKind = "manufacturing" | "services";

export type IsmOfficialSeriesDef = {
  code: string;
  sector: string;
  kind: IsmOfficialReportKind;
  /** 官网 At a Glance 表第一列 */
  officialLabel: string;
  officialLabelAliases?: readonly string[];
  displayName: string;
  /** TE 页有对应分项时用于校对 / 失败兜底 */
  teLabel?: string;
  /**
   * PR Newswire 新闻稿 "AT A GLANCE" 表对应行第一列文本（与 officialLabel 一致）。
   * 仅在已核实该分项出现在 PR Newswire 表中时才设置——不是"假设全覆盖"。
   */
  prNewswireLabel?: string;
};

export const ISM_OFFICIAL_MFG_SERIES: readonly IsmOfficialSeriesDef[] = [
  {
    code: "ism_us_ism_headline",
    sector: "headline",
    kind: "manufacturing",
    officialLabel: "Manufacturing PMI",
    displayName: "ISM 制造业 PMI",
    teLabel: "ISM Manufacturing PMI",
    prNewswireLabel: "Manufacturing PMI",
  },
  {
    code: "ism_us_ism_new_orders",
    sector: "new_orders",
    kind: "manufacturing",
    officialLabel: "New Orders",
    displayName: "ISM 制造业新订单",
    teLabel: "ISM Manufacturing New Orders",
    prNewswireLabel: "New Orders",
  },
  {
    code: "ism_us_ism_production",
    sector: "production",
    kind: "manufacturing",
    officialLabel: "Production",
    displayName: "ISM 制造业生产",
    teLabel: "ISM Manufacturing Production",
    prNewswireLabel: "Production",
  },
  {
    code: "ism_us_ism_employment",
    sector: "employment",
    kind: "manufacturing",
    officialLabel: "Employment",
    displayName: "ISM 制造业就业",
    teLabel: "ISM Manufacturing Employment",
    prNewswireLabel: "Employment",
  },
  {
    code: "ism_us_ism_supplier_deliveries",
    sector: "supplier_deliveries",
    kind: "manufacturing",
    officialLabel: "Supplier Deliveries",
    displayName: "ISM 制造业供应商交货",
    teLabel: "ISM Manufacturing Supplier Deliveries",
    prNewswireLabel: "Supplier Deliveries",
  },
  {
    code: "ism_us_ism_inventories",
    sector: "inventories",
    kind: "manufacturing",
    officialLabel: "Inventories",
    displayName: "ISM 制造业库存",
    teLabel: "ISM Manufacturing Inventories",
    prNewswireLabel: "Inventories",
  },
  {
    code: "ism_us_ism_customers_inventories",
    sector: "customers_inventories",
    kind: "manufacturing",
    officialLabel: "Customers' Inventories",
    officialLabelAliases: ["Customers’ Inventories"],
    displayName: "ISM 制造业客户库存",
    prNewswireLabel: "Customers' Inventories",
  },
  {
    code: "ism_us_ism_prices",
    sector: "prices",
    kind: "manufacturing",
    officialLabel: "Prices",
    displayName: "ISM 制造业价格指数",
    teLabel: "ISM Manufacturing Prices",
    prNewswireLabel: "Prices",
  },
  {
    code: "ism_us_ism_backlog",
    sector: "backlog",
    kind: "manufacturing",
    officialLabel: "Backlog of Orders",
    displayName: "ISM 制造业积压订单",
    teLabel: "ISM Manufacturing Backlog of Orders",
    prNewswireLabel: "Backlog of Orders",
  },
  {
    code: "ism_us_ism_new_export_orders",
    sector: "new_export_orders",
    kind: "manufacturing",
    officialLabel: "New Export Orders",
    displayName: "ISM 制造业新出口订单",
    prNewswireLabel: "New Export Orders",
  },
  {
    code: "ism_us_ism_imports",
    sector: "imports",
    kind: "manufacturing",
    officialLabel: "Imports",
    displayName: "ISM 制造业进口",
    prNewswireLabel: "Imports",
  },
];

export const ISM_OFFICIAL_SVC_SERIES: readonly IsmOfficialSeriesDef[] = [
  {
    code: "ism_svc_us_svc_headline",
    sector: "headline",
    kind: "services",
    officialLabel: "Services PMI",
    displayName: "ISM 服务业 PMI",
    teLabel: "United States ISM Services PMI",
    prNewswireLabel: "Services PMI",
  },
  {
    code: "ism_svc_us_svc_business_activity",
    sector: "business_activity",
    kind: "services",
    officialLabel: "Business Activity",
    officialLabelAliases: ["Business Activity/Production"],
    displayName: "ISM 服务业经营活动",
    teLabel: "ISM Services Business Activity",
    prNewswireLabel: "Business Activity",
  },
  {
    code: "ism_svc_us_svc_new_orders",
    sector: "new_orders",
    kind: "services",
    officialLabel: "New Orders",
    displayName: "ISM 服务业新订单",
    teLabel: "ISM Services New Orders",
    prNewswireLabel: "New Orders",
  },
  {
    code: "ism_svc_us_svc_employment",
    sector: "employment",
    kind: "services",
    officialLabel: "Employment",
    displayName: "ISM 服务业就业",
    teLabel: "ISM Services Employment",
    prNewswireLabel: "Employment",
  },
  {
    code: "ism_svc_us_svc_supplier_deliveries",
    sector: "supplier_deliveries",
    kind: "services",
    officialLabel: "Supplier Deliveries",
    displayName: "ISM 服务业供应商交货",
    prNewswireLabel: "Supplier Deliveries",
  },
  {
    code: "ism_svc_us_svc_inventories",
    sector: "inventories",
    kind: "services",
    officialLabel: "Inventories",
    displayName: "ISM 服务业库存",
    prNewswireLabel: "Inventories",
  },
  {
    code: "ism_svc_us_svc_prices",
    sector: "prices",
    kind: "services",
    officialLabel: "Prices",
    displayName: "ISM 服务业价格指数",
    teLabel: "ISM Services Prices",
    prNewswireLabel: "Prices",
  },
  {
    code: "ism_svc_us_svc_backlog",
    sector: "backlog",
    kind: "services",
    officialLabel: "Backlog of Orders",
    displayName: "ISM 服务业积压订单",
    prNewswireLabel: "Backlog of Orders",
  },
  {
    code: "ism_svc_us_svc_new_export_orders",
    sector: "new_export_orders",
    kind: "services",
    officialLabel: "New Export Orders",
    displayName: "ISM 服务业新出口订单",
    prNewswireLabel: "New Export Orders",
  },
  {
    code: "ism_svc_us_svc_imports",
    sector: "imports",
    kind: "services",
    officialLabel: "Imports",
    displayName: "ISM 服务业进口",
    prNewswireLabel: "Imports",
  },
  {
    code: "ism_svc_us_svc_inventory_sentiment",
    sector: "inventory_sentiment",
    kind: "services",
    officialLabel: "Inventory Sentiment",
    displayName: "ISM 服务业库存情绪",
    prNewswireLabel: "Inventory Sentiment",
  },
];

export const ISM_OFFICIAL_SERIES: readonly IsmOfficialSeriesDef[] = [
  ...ISM_OFFICIAL_MFG_SERIES,
  ...ISM_OFFICIAL_SVC_SERIES,
];

const BY_CODE = new Map(ISM_OFFICIAL_SERIES.map((row) => [row.code, row]));

export function ismOfficialSeriesByCode(code: string): IsmOfficialSeriesDef | null {
  return BY_CODE.get(code) ?? null;
}

export function ismOfficialReportUrl(kind: IsmOfficialReportKind, monthSlug: string): string {
  const tpl =
    kind === "manufacturing"
      ? ISM_OFFICIAL_MFG_REPORT_URL_TEMPLATE
      : ISM_OFFICIAL_SVC_REPORT_URL_TEMPLATE;
  return tpl.replace("{month}", monthSlug);
}

export const ENGLISH_MONTH_SLUGS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;
