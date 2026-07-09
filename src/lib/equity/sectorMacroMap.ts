/**
 * GICS Sector → 已有宏观 unified keys（fred: / mds:）。
 * 不新建宏观维度；无强映射的行业标注 pending。
 */

import type { GicsSector } from "@/lib/equity/gicsCatalog";

export type SectorMacroKey = {
  key: string;
  labelZh: string;
};

export type SectorMacroMapping = {
  sector: GicsSector;
  keys: readonly SectorMacroKey[];
  /** 深链宏观内置模板 id（可选） */
  macroTemplateId?: string;
  /** 宏观侧说明；pending 时 UI 提示待扩展 */
  noteZh?: string;
  pending?: boolean;
};

/** 总览页跨行业周期背景（固定 3–4 个） */
export const CYCLE_BACKGROUND_KEYS: readonly SectorMacroKey[] = [
  { key: "mds:ism_us_ism_headline", labelZh: "ISM 制造业 PMI" },
  { key: "fred:IPMAN::yoy", labelZh: "制造业工业生产 同比" },
  { key: "fred:DGS10::avg", labelZh: "10Y 国债收益率" },
  { key: "fred:BAMLH0A0HYM2::avg", labelZh: "美高收益债 OAS" },
];

export const SECTOR_MACRO_MAP: Record<GicsSector, SectorMacroMapping> = {
  Energy: {
    sector: "Energy",
    keys: [
      { key: "fred:DTWEXBGS::avg", labelZh: "美元广义指数" },
      { key: "fred:BOPGSTB", labelZh: "贸易差额" },
    ],
    noteZh: "能源商品仓位可对照 COT；首期以美元与贸易为背景。",
  },
  Materials: {
    sector: "Materials",
    keys: [
      { key: "mds:ism_us_ism_headline", labelZh: "ISM 制造业 PMI" },
      { key: "fred:IPMAN::yoy", labelZh: "制造业工业生产 同比" },
      { key: "fred:BUSINV::yoy", labelZh: "总商业库存 同比" },
      { key: "fred:MCUMFN", labelZh: "制造业产能利用率" },
    ],
    macroTemplateId: "builtin-us-industry-inventory-orders",
  },
  Industrials: {
    sector: "Industrials",
    keys: [
      { key: "mds:ism_us_ism_headline", labelZh: "ISM 制造业 PMI" },
      { key: "mds:ism_us_ism_new_orders", labelZh: "ISM 新订单" },
      { key: "fred:IPMAN::yoy", labelZh: "制造业工业生产 同比" },
      { key: "fred:BUSINV::yoy", labelZh: "总商业库存 同比" },
    ],
    macroTemplateId: "builtin-us-industry-inventory-cycle",
  },
  "Consumer Discretionary": {
    sector: "Consumer Discretionary",
    keys: [
      { key: "fred:RSXFS::yoy", labelZh: "零售销售(除汽车) 同比" },
      { key: "fred:UMCSENT", labelZh: "密歇根消费者信心" },
      { key: "fred:PSAVERT", labelZh: "个人储蓄率" },
      { key: "fred:REVOLSL::yoy", labelZh: "循环信贷 同比" },
    ],
    macroTemplateId: "builtin-us-consumer-balance-spending",
  },
  "Consumer Staples": {
    sector: "Consumer Staples",
    keys: [
      { key: "fred:RSXFS::yoy", labelZh: "零售销售(除汽车) 同比" },
      { key: "fred:PCESC96::yoy", labelZh: "实际服务消费 同比" },
      { key: "fred:PSAVERT", labelZh: "个人储蓄率" },
      { key: "fred:TDSP", labelZh: "债务偿付比率" },
    ],
    macroTemplateId: "builtin-us-consumer-balance-spending",
  },
  "Health Care": {
    sector: "Health Care",
    keys: [
      { key: "fred:CFNAI", labelZh: "芝加哥联储全国活动指数" },
      { key: "fred:DGS10::avg", labelZh: "10Y 国债收益率" },
    ],
    pending: true,
    noteZh: "医疗行业宏观映射待扩展；暂用跨周期背景指标。",
  },
  Financials: {
    sector: "Financials",
    keys: [
      { key: "fred:EFFR::avg", labelZh: "有效联邦基金利率" },
      { key: "fred:DGS10::avg", labelZh: "10Y 国债收益率" },
      { key: "fred:BAMLH0A0HYM2::avg", labelZh: "美高收益债 OAS" },
      { key: "fred:DRTSCILM", labelZh: "银行收紧工商业贷款标准" },
    ],
    macroTemplateId: "builtin-us-monetary-overview",
  },
  "Information Technology": {
    sector: "Information Technology",
    keys: [
      { key: "fred:NFCI::avg", labelZh: "芝加哥联储金融条件" },
      { key: "fred:DGS10::avg", labelZh: "10Y 国债收益率" },
      { key: "fred:CFNAI", labelZh: "芝加哥联储全国活动指数" },
    ],
    pending: true,
    noteZh: "科技以财报与估值为主；宏观侧给金融条件与活动背景。",
  },
  "Communication Services": {
    sector: "Communication Services",
    keys: [
      { key: "fred:RSXFS::yoy", labelZh: "零售销售(除汽车) 同比" },
      { key: "fred:NFCI::avg", labelZh: "芝加哥联储金融条件" },
    ],
    pending: true,
    noteZh: "通信服务宏观映射待扩展。",
  },
  Utilities: {
    sector: "Utilities",
    keys: [
      { key: "fred:DGS10::avg", labelZh: "10Y 国债收益率" },
      { key: "fred:T10YIE::avg", labelZh: "10Y 盈亏平衡通胀" },
    ],
    pending: true,
    noteZh: "公用事业对利率敏感；行业专属宏观待扩展。",
  },
  "Real Estate": {
    sector: "Real Estate",
    keys: [
      { key: "fred:MORTGAGE30US::avg", labelZh: "30年按揭利率" },
      { key: "fred:PERMIT::yoy", labelZh: "营建许可 同比" },
      { key: "fred:CSUSHPINSA::yoy", labelZh: "Case-Shiller 房价 同比" },
      { key: "fred:DGS10::avg", labelZh: "10Y 国债收益率" },
    ],
    macroTemplateId: "builtin-us-housing-activity",
  },
};

export function getSectorMacroMapping(sector: GicsSector): SectorMacroMapping {
  return SECTOR_MACRO_MAP[sector];
}
