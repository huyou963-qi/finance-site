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

/**
 * 总览页「风格轮动」宏观背景（固定 4 个）。
 *
 * 依据行业/风格轮动实务常用的「宏观三件套」+ 利率水平：
 * - ISM PMI：景气扩张/收缩 → 周期 vs 防御
 * - 10Y−3M 曲线：衰退领先信号 → 曲线倒挂偏防御，陡峭化偏早周期/金融
 * - 10Y 收益率：贴现率/久期 → 利率上行压制成长（科技/通信）
 * - HY OAS：风险偏好 → 利差走阔偏防御，收窄偏周期/成长风险资产
 *
 * 刻意不用工业生产同比：滞后且与 ISM 信息重叠。
 */
export const CYCLE_BACKGROUND_KEYS: readonly SectorMacroKey[] = [
  { key: "mds:ism_us_ism_headline", labelZh: "ISM 制造业 PMI" },
  { key: "fred:T10Y3M::avg", labelZh: "10Y−3M 收益率曲线" },
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
    // 医疗：收入端看医疗通胀（定价）与服务消费，成本端看时薪（人力密集），防御属性对照利率
    keys: [
      { key: "fred:CPIMEDSL::yoy", labelZh: "CPI 医疗 同比" },
      { key: "fred:PCESC96::yoy", labelZh: "实际服务消费 同比" },
      { key: "fred:AHETPI::yoy", labelZh: "平均时薪 同比（人力成本）" },
      { key: "fred:DGS10::avg", labelZh: "10Y 国债收益率" },
    ],
    macroTemplateId: "builtin-us-cpi-drivers",
    noteZh: "医疗通胀高于整体 CPI 时行业定价权占优；时薪走高压缩医院/服务商利润率。",
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
    // 科技：需求端看企业资本开支（核心资本品新订单/私人固定投资），估值端看实际利率与金融条件
    keys: [
      { key: "fred:NEWORDER::yoy", labelZh: "核心资本品新订单 同比" },
      { key: "fred:PNFIC1::yoy", labelZh: "实际私人固定投资 同比" },
      { key: "fred:DFII10::avg", labelZh: "10Y 实际收益率（TIPS）" },
      { key: "fred:NFCI::avg", labelZh: "芝加哥联储金融条件" },
    ],
    macroTemplateId: "builtin-us-monetary-conditions",
    noteZh: "成长股久期长，实际利率上行压估值；资本开支周期决定企业 IT 需求。",
  },
  "Communication Services": {
    sector: "Communication Services",
    // 通信服务双结构：互联网广告/媒体（META/GOOGL/NFLX）顺消费周期，电信（T/VZ）高股息类债券
    keys: [
      { key: "fred:PCEC96::yoy", labelZh: "实际个人消费支出 同比" },
      { key: "fred:UMCSENT", labelZh: "密歇根消费者信心" },
      { key: "fred:NFCI::avg", labelZh: "芝加哥联储金融条件" },
      { key: "fred:DGS10::avg", labelZh: "10Y 国债收益率" },
    ],
    macroTemplateId: "builtin-us-consumer-balance-spending",
    noteZh: "广告预算随消费与信心波动；电信子板块对利率敏感（高股息久期）。",
  },
  Utilities: {
    sector: "Utilities",
    // 公用事业：类债券（利率+通胀预期定估值），量端看工业生产（电力需求代理），成本端看能源价格
    keys: [
      { key: "fred:DGS10::avg", labelZh: "10Y 国债收益率" },
      { key: "fred:T10YIE::avg", labelZh: "10Y 盈亏平衡通胀" },
      { key: "fred:INDPRO::yoy", labelZh: "工业生产 同比（电力需求代理）" },
      { key: "fred:DCOILWTICO::avg", labelZh: "WTI 原油（燃料成本代理）" },
    ],
    macroTemplateId: "builtin-us-monetary-conditions",
    noteZh: "10Y 收益率是估值主导变量；监管定价下燃料成本传导有时滞。",
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
