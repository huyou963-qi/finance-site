export const JP_ESRI_MACHINERY_ORDERS_PROVIDER = "jp_esri_machinery_orders";
export const JP_ESRI_MACHINERY_ORDERS_SOURCE_ID = "jp-esri-machinery-orders";
export const JP_ESRI_MACHINERY_ORDERS_PACKAGE_ID = "jp.esri.machinery_orders";

export const JP_ESRI_MACHINERY_ORDERS_PAGE_URL =
  "https://www.esri.cao.go.jp/jp/stat/juchu/juchu.html";
export const JP_ESRI_MACHINERY_ORDERS_SCHEDULE_URL =
  "https://www.esri.cao.go.jp/jp/stat/stat-schedule.html";
export const JP_CABINET_OFFICE_TERMS_URL = "https://www.cao.go.jp/notice/rule.html";

/**
 * Official monthly, seasonally adjusted order levels from the long-run
 * "Machinery Orders by Sectors" workbook. Each aggregate is independently
 * published by ESRI; in particular, the ex-ships/ex-volatile aggregates must
 * not be reconstructed by summing independently adjusted components.
 */
export const JP_ESRI_MACHINERY_ORDERS_SERIES = [
  {
    instrumentCode: "esri_jp_machinery_orders_total_sa",
    column: 2,
    label: "机械订单总额（季调）",
    headerFingerprint: "受注額合計 | Total",
  },
  {
    instrumentCode: "esri_jp_machinery_orders_total_ex_ships_sa",
    column: 3,
    label: "机械订单总额（除船舶、季调）",
    headerFingerprint: "(船舶を除く) | (Exc. for | ships)",
  },
  {
    instrumentCode: "esri_jp_machinery_orders_overseas_sa",
    column: 4,
    label: "机械订单：海外需求（季调）",
    headerFingerprint: "外 需 | From | overseas",
  },
  {
    instrumentCode: "esri_jp_machinery_orders_government_sa",
    column: 5,
    label: "机械订单：政府需求（季调）",
    headerFingerprint: "官 公 需 | Governments",
  },
  {
    instrumentCode: "esri_jp_machinery_orders_private_sa",
    column: 6,
    label: "机械订单：民间需求（季调）",
    headerFingerprint: "民 需 | Private- | sector",
  },
  {
    instrumentCode: "esri_jp_machinery_orders_private_ex_ships_sa",
    column: 7,
    label: "机械订单：民间需求（除船舶、季调）",
    headerFingerprint: "(船舶を除く) | (Exc. for | ships)",
  },
  {
    instrumentCode: "esri_jp_machinery_orders_private_ex_volatile_sa",
    column: 8,
    label: "核心机械订单：民间需求（除船舶及电力、季调）",
    headerFingerprint: "(船舶・電力 | を除く) | (Exc. Volatile | orders*)",
  },
  {
    instrumentCode: "esri_jp_machinery_orders_manufacturing_sa",
    column: 9,
    label: "机械订单：制造业（季调）",
    headerFingerprint: "製 造 業 | Manufacturing",
  },
  {
    instrumentCode: "esri_jp_machinery_orders_nonmanufacturing_sa",
    column: 10,
    label: "机械订单：非制造业（季调）",
    headerFingerprint: "非製造業 | Non- | manufacturing",
  },
  {
    instrumentCode: "esri_jp_machinery_orders_nonmanufacturing_ex_ships_sa",
    column: 11,
    label: "机械订单：非制造业（除船舶、季调）",
    headerFingerprint: "(船舶を除く) | (Exc. for | ships)",
  },
  {
    instrumentCode: "esri_jp_machinery_orders_nonmanufacturing_ex_volatile_sa",
    column: 12,
    label: "机械订单：非制造业（除船舶及电力、季调）",
    headerFingerprint: "(船舶・電力 | を除く) | (Exc. Volatile | orders*)",
  },
  {
    instrumentCode: "esri_jp_machinery_orders_through_agencies_sa",
    column: 13,
    label: "机械订单：代理店需求（季调）",
    headerFingerprint: "代 理 店 | Through | agencies",
  },
  {
    instrumentCode: "esri_jp_machinery_orders_domestic_sa",
    column: 14,
    label: "机械订单：国内需求（季调）",
    headerFingerprint: "内 需 | Domestic | demand",
  },
] as const;

export type JpEsriMachineryOrdersSeries =
  (typeof JP_ESRI_MACHINERY_ORDERS_SERIES)[number];

export function jpEsriMachineryOrdersSeriesByCode(code: string) {
  return JP_ESRI_MACHINERY_ORDERS_SERIES.find(
    (series) => series.instrumentCode === code,
  );
}
