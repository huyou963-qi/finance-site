import relativeImportanceSnapshot from "./cpi-relative-importance-2025.json";

/**
 * CPI 分项环比表（复刻 BLS「Table A. Percent changes in CPI-U」）的行定义。
 *
 * - 行 = 各 CPI 分项（按 BLS Table A 的层级顺序与缩进）
 * - 列 = 最近若干个月的季调环比（MoM %）
 * - 末列 = 各分项权重（BLS relative importance, CPI-U，见 cpi-relative-importance-2025.json）
 *
 * 所有 fredId 均为季调（SA，`CUSR0000*` 或聚合 `CPI*SL`）指数序列；环比在前端由指数水平计算，
 * DB 只存原始指数（与宏观页 seriesCalcConfigMap 一致，不预存 MoM）。
 */
export type CpiMomMatrixRow = {
  fredId: string;
  /** 目录/表格显示名（中文） */
  labelZh: string;
  /** BLS 官方英文行名 */
  labelEn: string;
  /** 缩进层级（0 = 总项，越大越细分），用于表格左列的层级排版 */
  indent: 0 | 1 | 2 | 3;
  /** true 时用较重字体（总项 / 三分法 / 核心）以贴近 BLS 加粗行 */
  emphasize?: boolean;
  /** 脚注标记（如口径替代说明） */
  footnote?: string;
};

/** BLS Table A 行顺序（自上而下）——分项作行 */
export const CPI_MOM_MATRIX_ROWS: readonly CpiMomMatrixRow[] = [
  { fredId: "CPIAUCSL", labelZh: "所有项目（总 CPI）", labelEn: "All items", indent: 0, emphasize: true },
  { fredId: "CPIUFDSL", labelZh: "食品", labelEn: "Food", indent: 1, emphasize: true },
  { fredId: "CUSR0000SAF11", labelZh: "家庭食品", labelEn: "Food at home", indent: 2 },
  { fredId: "CUSR0000SEFV", labelZh: "外出就餐", labelEn: "Food away from home", indent: 2 },
  { fredId: "CPIENGSL", labelZh: "能源", labelEn: "Energy", indent: 1, emphasize: true },
  { fredId: "CUSR0000SACE", labelZh: "能源商品", labelEn: "Energy commodities", indent: 2 },
  { fredId: "CUSR0000SETB01", labelZh: "汽油（全部类型）", labelEn: "Gasoline (all types)", indent: 3 },
  {
    fredId: "CUSR0000SEHE",
    labelZh: "燃油及其他燃料",
    labelEn: "Fuel oil",
    indent: 3,
    footnote: "FRED 无单独「燃油」季调序列，采用「燃油及其他燃料（SA）」，权重口径随之为 0.140",
  },
  { fredId: "CUSR0000SEHF", labelZh: "能源服务", labelEn: "Energy services", indent: 2 },
  { fredId: "CUSR0000SEHF01", labelZh: "电力", labelEn: "Electricity", indent: 3 },
  { fredId: "CUSR0000SEHF02", labelZh: "管道燃气服务", labelEn: "Utility (piped) gas service", indent: 3 },
  {
    fredId: "CPILFESL",
    labelZh: "核心 CPI（除食品与能源）",
    labelEn: "All items less food and energy",
    indent: 1,
    emphasize: true,
  },
  {
    fredId: "CUSR0000SACL1E",
    labelZh: "核心商品（除食品能源商品）",
    labelEn: "Commodities less food and energy commodities",
    indent: 2,
  },
  { fredId: "CUSR0000SETA01", labelZh: "新车", labelEn: "New vehicles", indent: 3 },
  { fredId: "CUSR0000SETA02", labelZh: "二手车与卡车", labelEn: "Used cars and trucks", indent: 3 },
  { fredId: "CPIAPPSL", labelZh: "服装", labelEn: "Apparel", indent: 3 },
  { fredId: "CUSR0000SAM1", labelZh: "医疗护理商品", labelEn: "Medical care commodities", indent: 3 },
  {
    fredId: "CUSR0000SASLE",
    labelZh: "核心服务（除能源服务）",
    labelEn: "Services less energy services",
    indent: 2,
  },
  { fredId: "CUSR0000SAH1", labelZh: "住房（Shelter）", labelEn: "Shelter", indent: 3 },
  { fredId: "CUSR0000SAS4", labelZh: "交通运输服务", labelEn: "Transportation services", indent: 3 },
  { fredId: "CUSR0000SAM2", labelZh: "医疗护理服务", labelEn: "Medical care services", indent: 3 },
] as const;

/** 表格所需的全部 FRED 序列（去重，保持行顺序） */
export const CPI_MOM_MATRIX_FRED_IDS: readonly string[] = CPI_MOM_MATRIX_ROWS.map(
  (r) => r.fredId,
);

type RelativeImportanceSnapshot = {
  index: string;
  asOf: string;
  weightBase: string;
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  weights: Record<string, { item: string; cpiU: number }>;
};

export const CPI_RELATIVE_IMPORTANCE: RelativeImportanceSnapshot =
  relativeImportanceSnapshot as RelativeImportanceSnapshot;

/** 取某 fredId 分项的权重（CPI-U relative importance，%）；无则 null */
export function cpiWeightForFredId(fredId: string): number | null {
  const w = CPI_RELATIVE_IMPORTANCE.weights[fredId];
  return w ? w.cpiU : null;
}

/** 权重快照的展示元信息（表脚注、来源标注用） */
export const CPI_WEIGHT_META = {
  asOf: CPI_RELATIVE_IMPORTANCE.asOf,
  weightBase: CPI_RELATIVE_IMPORTANCE.weightBase,
  source: CPI_RELATIVE_IMPORTANCE.source,
  sourceUrl: CPI_RELATIVE_IMPORTANCE.sourceUrl,
} as const;
