/** 国家统计局中国 PMI 官方月度 Excel：指标、列名与数据源常量。 */

export const NBS_PMI_INDEX_URL = "https://www.stats.gov.cn/sj/zxfb/";
export const NBS_PMI_SYNC_SCRIPT = "scripts/data-worker/sync-nbs-pmi.ts";

export type NbsPmiInstrumentDef = {
  code: string;
  component: string;
  sheetName: "制造业" | "非制造业";
  sourceLabel: string;
  displayName: string;
};

export const NBS_PMI_INSTRUMENTS: readonly NbsPmiInstrumentDef[] = [
  {
    code: "chov_c05_mfg_pmi",
    component: "mfg_headline",
    sheetName: "制造业",
    sourceLabel: "PMI",
    displayName: "制造业PMI",
  },
  {
    code: "nbs_cn_mfg_production",
    component: "mfg_production",
    sheetName: "制造业",
    sourceLabel: "生产",
    displayName: "制造业PMI：生产",
  },
  {
    code: "nbs_cn_mfg_new_orders",
    component: "mfg_new_orders",
    sheetName: "制造业",
    sourceLabel: "新订单",
    displayName: "制造业PMI：新订单",
  },
  {
    code: "nbs_cn_mfg_raw_material_inventory",
    component: "mfg_raw_material_inventory",
    sheetName: "制造业",
    sourceLabel: "原材料库存",
    displayName: "制造业PMI：原材料库存",
  },
  {
    code: "nbs_cn_mfg_employment",
    component: "mfg_employment",
    sheetName: "制造业",
    sourceLabel: "从业人员",
    displayName: "制造业PMI：从业人员",
  },
  {
    code: "nbs_cn_mfg_supplier_delivery",
    component: "mfg_supplier_delivery",
    sheetName: "制造业",
    sourceLabel: "供应商配送时间",
    displayName: "制造业PMI：供应商配送时间",
  },
  {
    code: "nbs_cn_mfg_new_export_orders",
    component: "mfg_new_export_orders",
    sheetName: "制造业",
    sourceLabel: "新出口订单",
    displayName: "制造业PMI：新出口订单",
  },
  {
    code: "nbs_cn_mfg_imports",
    component: "mfg_imports",
    sheetName: "制造业",
    sourceLabel: "进口",
    displayName: "制造业PMI：进口",
  },
  {
    code: "nbs_cn_mfg_purchases",
    component: "mfg_purchases",
    sheetName: "制造业",
    sourceLabel: "采购量",
    displayName: "制造业PMI：采购量",
  },
  {
    code: "nbs_cn_mfg_input_prices",
    component: "mfg_input_prices",
    sheetName: "制造业",
    sourceLabel: "主要原材料购进价格",
    displayName: "制造业PMI：主要原材料购进价格",
  },
  {
    code: "nbs_cn_mfg_output_prices",
    component: "mfg_output_prices",
    sheetName: "制造业",
    sourceLabel: "出厂价格",
    displayName: "制造业PMI：出厂价格",
  },
  {
    code: "nbs_cn_mfg_finished_goods_inventory",
    component: "mfg_finished_goods_inventory",
    sheetName: "制造业",
    sourceLabel: "产成品库存",
    displayName: "制造业PMI：产成品库存",
  },
  {
    code: "nbs_cn_mfg_backlog",
    component: "mfg_backlog",
    sheetName: "制造业",
    sourceLabel: "在手订单",
    displayName: "制造业PMI：在手订单",
  },
  {
    code: "nbs_cn_mfg_expectations",
    component: "mfg_expectations",
    sheetName: "制造业",
    sourceLabel: "生产经营活动预期",
    displayName: "制造业PMI：生产经营活动预期",
  },
  {
    code: "chov_c06_nm_pmi",
    component: "non_mfg_headline",
    sheetName: "非制造业",
    sourceLabel: "商务活动",
    displayName: "非制造业PMI：商务活动",
  },
  {
    code: "nbs_cn_non_mfg_new_orders",
    component: "non_mfg_new_orders",
    sheetName: "非制造业",
    sourceLabel: "新订单",
    displayName: "非制造业PMI：新订单",
  },
  {
    code: "nbs_cn_non_mfg_input_prices",
    component: "non_mfg_input_prices",
    sheetName: "非制造业",
    sourceLabel: "投入品价格",
    displayName: "非制造业PMI：投入品价格",
  },
  {
    code: "nbs_cn_non_mfg_sales_prices",
    component: "non_mfg_sales_prices",
    sheetName: "非制造业",
    sourceLabel: "销售价格",
    displayName: "非制造业PMI：销售价格",
  },
  {
    code: "nbs_cn_non_mfg_employment",
    component: "non_mfg_employment",
    sheetName: "非制造业",
    sourceLabel: "从业人员",
    displayName: "非制造业PMI：从业人员",
  },
  {
    code: "nbs_cn_non_mfg_expectations",
    component: "non_mfg_expectations",
    sheetName: "非制造业",
    sourceLabel: "业务活动预期",
    displayName: "非制造业PMI：业务活动预期",
  },
  {
    code: "nbs_cn_non_mfg_new_export_orders",
    component: "non_mfg_new_export_orders",
    sheetName: "非制造业",
    sourceLabel: "新出口订单",
    displayName: "非制造业PMI：新出口订单",
  },
  {
    code: "nbs_cn_non_mfg_backlog",
    component: "non_mfg_backlog",
    sheetName: "非制造业",
    sourceLabel: "在手订单",
    displayName: "非制造业PMI：在手订单",
  },
  {
    code: "nbs_cn_non_mfg_inventory",
    component: "non_mfg_inventory",
    sheetName: "非制造业",
    sourceLabel: "存货",
    displayName: "非制造业PMI：存货",
  },
  {
    code: "nbs_cn_non_mfg_supplier_delivery",
    component: "non_mfg_supplier_delivery",
    sheetName: "非制造业",
    sourceLabel: "供应商配送时间",
    displayName: "非制造业PMI：供应商配送时间",
  },
] as const;

export const NBS_PMI_INSTRUMENT_CODES = NBS_PMI_INSTRUMENTS.map((row) => row.code);

export const NBS_PMI_HISTORY_API_URL =
  "https://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData";
export const NBS_PMI_HISTORY_ROOT_ID = "fc982599aa684be7969d7b90b1bd0e84";
export const NBS_PMI_CID_BY_SHEET = {
  制造业: "93ffbb1aa85740d3aa2618371508b606",
  非制造业: "7a64a6e25aec4a8e9dde044ecd9e2cce",
} as const;

/** 国家数据新版 UUID 指标（2026-08 实测）；旧 A0B easyquery 代码仅作口径核对，不再请求。 */
export const NBS_PMI_INDICATOR_ID_BY_CODE: Record<string, string> = {
  chov_c05_mfg_pmi: "a09aa989bdcf4cffa2021795722eb916",
  nbs_cn_mfg_production: "6729aa00f9ed46d8b30c5d2312214b89",
  nbs_cn_mfg_new_orders: "4151df33b53f4d02ae9f51fe402f1a50",
  nbs_cn_mfg_new_export_orders: "fb245388740743d0974af1b00cfd27bb",
  nbs_cn_mfg_backlog: "d14ffd61d762435b8360896a13787659",
  nbs_cn_mfg_finished_goods_inventory: "48ec2904ba8848cf9488fa99d3731525",
  nbs_cn_mfg_purchases: "c83954218ae645cf975ed4f66b4a57f2",
  nbs_cn_mfg_imports: "0cfb958d221a488da4fe4514b96b5cb0",
  nbs_cn_mfg_output_prices: "105a73cd48cc47d4a914ebccdedf24ec",
  nbs_cn_mfg_input_prices: "f8d4068c475844bb9485f9363935119e",
  nbs_cn_mfg_raw_material_inventory: "c149709d0c48422d83a59d4b94d03bbb",
  nbs_cn_mfg_employment: "24454731f2fd46f1850da13fe6f39263",
  nbs_cn_mfg_supplier_delivery: "23a80d4340314e45ab0cc0ce69f3eeec",
  nbs_cn_mfg_expectations: "b0bf6dec50d3459086e79e0336c92246",
  chov_c06_nm_pmi: "88a150208f6e4a1db8babe41ae700f66",
  nbs_cn_non_mfg_new_orders: "e64aa8133ca647da8f75893583a5bb24",
  nbs_cn_non_mfg_new_export_orders: "55ef7f3b8fc44bd791de8c0dd1c0ec56",
  nbs_cn_non_mfg_backlog: "b5957bb8bb284cfaaeaf06abb84a562c",
  nbs_cn_non_mfg_inventory: "77e232b90a314d53a63741ca923c90fb",
  nbs_cn_non_mfg_input_prices: "61d7f87361374c7e9f9b811a69e5e5c9",
  nbs_cn_non_mfg_sales_prices: "60c688be2e284933986a6f42fd65b366",
  nbs_cn_non_mfg_employment: "bbe0067c5fbb49eda66f8fd8d60811cf",
  nbs_cn_non_mfg_supplier_delivery: "fa78c1b7b0424f0598e04fff9fd0e6ef",
  nbs_cn_non_mfg_expectations: "7f8ebe0d686142cbaccf5b2ee450c50c",
};

export function nbsPmiInstrument(code: string): NbsPmiInstrumentDef | null {
  return NBS_PMI_INSTRUMENTS.find((row) => row.code === code) ?? null;
}

export const NBS_PMI_SOURCE = {
  id: "nbs-pmi",
  agencyId: "cn-nbs",
  name: "国家统计局中国采购经理指数发布包",
  baseUrl: NBS_PMI_INDEX_URL,
  termsUrl: "https://www.stats.gov.cn/english/nbs/200701/t20070104_59236.html",
} as const;
