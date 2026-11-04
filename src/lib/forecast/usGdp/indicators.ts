/**
 * GDP nowcast 的输入目录与模型配置（仅服务端；页面对非管理员不下发本文件中的任何信息）。
 * 方程组合在验证期 2000–2011 选定，测试期 2012+ 未参与选择：docs/research/US_GDP_NOWCAST.md。
 */
import type { EquationSpec, IndicatorTransform, ModelConfig } from "./model";

export type GdpIndicatorDef = {
  key: string;
  code: string;
  seriesKey: string;
  label: string;
  transform: IndicatorTransform;
  /** 账本没有版本记录的月份：月末之后多少天视为首次可见（官方发布节奏的保守近似） */
  lagDays: number;
};

export const GDP_INDICATORS: readonly GdpIndicatorDef[] = [
  { key: "PAYEMS", code: "sched_fred_PAYEMS", seriesKey: "fred:PAYEMS", label: "非农就业", transform: "growth", lagDays: 7 },
  { key: "INDPRO", code: "sched_fred_INDPRO", seriesKey: "fred:INDPRO", label: "工业生产指数", transform: "growth", lagDays: 17 },
  { key: "PCEC96", code: "sched_fred_PCEC96", seriesKey: "fred:PCEC96", label: "实际个人消费支出", transform: "growth", lagDays: 31 },
  { key: "RSAFS", code: "sched_fred_RSAFS", seriesKey: "fred:RSAFS", label: "零售销售总额", transform: "growth", lagDays: 16 },
  { key: "HOUST", code: "sched_fred_HOUST", seriesKey: "fred:HOUST", label: "新屋开工", transform: "growth", lagDays: 19 },
  { key: "NEWORDER", code: "sched_fred_NEWORDER", seriesKey: "fred:NEWORDER", label: "核心资本品新订单", transform: "growth", lagDays: 28 },
  { key: "BOPGSTB", code: "sched_fred_BOPGSTB", seriesKey: "fred:BOPGSTB", label: "商品与服务贸易差额（对 GDP 拉动）", transform: "nx", lagDays: 37 },
  { key: "BUSINV", code: "sched_fred_BUSINV", seriesKey: "fred:BUSINV", label: "商业库存（存货投资拉动）", transform: "inv", lagDays: 46 },
  { key: "ISM", code: "ism_us_ism_headline", seriesKey: "mds:ism_us_ism_headline", label: "ISM 制造业 PMI", transform: "level", lagDays: 3 },
  { key: "ISMSVC", code: "ism_svc_us_svc_headline", seriesKey: "mds:ism_svc_us_svc_headline", label: "ISM 服务业 PMI", transform: "level", lagDays: 5 },
];

export const GDP_REAL_CODE = "sched_fred_GDPC1";
export const GDP_NOMINAL_CODE = "sched_fred_GDP";

const single = (key: string): EquationSpec => ({ key, inputs: [key] });

export const GDP_EQUATION_LABELS: Record<string, string> = {
  ...Object.fromEntries(GDP_INDICATORS.map((d) => [d.key, d.label])),
  C4: "支出法分项：消费 + 净出口 + 存货 + 工业生产",
  C6: "支出法分项：消费 + 净出口 + 存货 + 工业生产 + 设备订单 + 住宅",
};

export const GDP_MODEL_CONFIG: ModelConfig = {
  equations: [
    ...["PAYEMS", "INDPRO", "PCEC96", "RSAFS", "HOUST", "NEWORDER", "ISM", "ISMSVC"].map(single),
    { key: "C4", inputs: ["PCEC96", "BOPGSTB", "BUSINV", "INDPRO"] },
    { key: "C6", inputs: ["PCEC96", "BOPGSTB", "BUSINV", "INDPRO", "NEWORDER", "HOUST"] },
  ],
  window: 40,
  minTrain: 16,
  weightWindow: 8,
};
