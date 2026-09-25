import type { LeafKey } from "./model";

export type ComponentGroup = "食品" | "能源" | "核心商品" | "核心服务";

export type ComponentMeta = {
  key: LeafKey;
  label: string;
  labelEn: string;
  group: ComponentGroup;
  /** 高频代理 / 方法说明 */
  proxy: string;
};

const TREND = "自回归 + 12 个月均值 + 残余季节性（无可靠公开高频代理）";

export const CPI_NOWCAST_COMPONENTS: readonly ComponentMeta[] = [
  { key: "FAH", label: "家庭食品", labelEn: "Food at home", group: "食品", proxy: "PPI 最终需求食品（滞后 1 月）+ 自回归" },
  { key: "FAFH", label: "外出就餐", labelEn: "Food away from home", group: "食品", proxy: "近 3 个月 / 12 个月均值" },
  {
    key: "GAS",
    label: "汽油",
    labelEn: "Gasoline",
    group: "能源",
    proxy: "EIA 周度零售汽油价（当月 1–22 日均值）→ 未季调汽油 CPI，再叠加过去 3 年同月季节因子差",
  },
  { key: "FUEL", label: "燃油", labelEn: "Fuel oil & other fuels", group: "能源", proxy: "纽约港 2 号取暖油现货（当月、上月）" },
  { key: "ELEC", label: "电力", labelEn: "Electricity", group: "能源", proxy: "亨利港天然气（滞后 1–2 月）+ 自回归" },
  { key: "UGAS", label: "管道燃气", labelEn: "Utility gas service", group: "能源", proxy: "亨利港天然气（当月及滞后 1–2 月）+ 自回归" },
  { key: "NEWV", label: "新车", labelEn: "New vehicles", group: "核心商品", proxy: TREND },
  { key: "USED", label: "二手车", labelEn: "Used cars and trucks", group: "核心商品", proxy: "Manheim 二手车批发价指数（滞后 1–3 月）" },
  { key: "APP", label: "服装", labelEn: "Apparel", group: "核心商品", proxy: TREND },
  { key: "MEDC", label: "医疗商品", labelEn: "Medical care commodities", group: "核心商品", proxy: TREND },
  { key: "OCG", label: "其他核心商品", labelEn: "Other core goods (residual)", group: "核心商品", proxy: `残差分项；${TREND}` },
  { key: "RENT", label: "主要住所租金", labelEn: "Rent of primary residence", group: "核心服务", proxy: "Zillow 观测租金指数（12 个月均值，滞后 7 月）+ 自身滞后" },
  { key: "OER", label: "业主等价租金", labelEn: "Owners' equivalent rent", group: "核心服务", proxy: "Zillow 观测租金指数（12 个月均值，滞后 7 月）+ 自身滞后" },
  { key: "LODG", label: "外宿（酒店）", labelEn: "Lodging away from home", group: "核心服务", proxy: TREND },
  { key: "MEDS", label: "医疗服务", labelEn: "Medical care services", group: "核心服务", proxy: TREND },
  { key: "AIR", label: "机票", labelEn: "Airline fares", group: "核心服务", proxy: "墨西哥湾航空煤油现货（当月、上月）+ 自回归" },
  {
    key: "OTRS",
    label: "其他交通服务",
    labelEn: "Other transportation services (residual)",
    group: "核心服务",
    proxy: `残差分项（车险、维修等）；${TREND}`,
  },
  { key: "OCS", label: "其他核心服务", labelEn: "Other core services (residual)", group: "核心服务", proxy: `残差分项；${TREND}` },
];
