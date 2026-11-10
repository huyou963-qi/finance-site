/**
 * 「股票数据」页（/equity/data）的共享类型：浏览器与服务端都用，不含取数规则。
 * 设计见 docs/specs/equity-stock-data.spec.md。
 */

/** 单次查询上限（spec §6：Pro 专属，50 只 × 50 列） */
export const MAX_SYMBOLS = 50;
export const MAX_COLUMNS = 50;

/**
 * 报告期：按公司自己的财年取数（AAPL 的 FY2025 截止 2025-09）。
 * FQ 的 year 是该季所属财年，q 是财季位置 1–4。
 */
export type PeriodSpec =
  | { kind: "latestFY" }
  | { kind: "latestQ" }
  | { kind: "FY"; year: number }
  | { kind: "FQ"; year: number; q: 1 | 2 | 3 | 4 };

/** 季度报告期下流量类科目的口径：单季或截至该季的滚动 4 季 */
export type Basis = "single" | "ttm";

/** 行情、估值、趋势类的截止日：最近交易日，或指定日期（取该日或之前最近一个交易日） */
export type AsOfSpec = { kind: "latest" } | { kind: "date"; date: string };

export const RANGE_PRESETS = ["1m", "3m", "6m", "ytd", "1y", "3y", "5y"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

/** 区间类指标的起止：相对最近交易日的预设区间，或指定起止日 */
export type RangeSpec = { kind: "preset"; preset: RangePreset } | { kind: "custom"; from: string; to: string };

/** 价格口径：前复权（含拆股与分红）或不复权（当日实际成交价） */
export type PriceAdjust = "forward" | "none";

/** 金额与股数的显示单位（只影响显示和导出，不影响取数） */
export type Scale = "auto" | "raw" | "k" | "m" | "b";

export type ColumnParams = {
  period?: PeriodSpec;
  basis?: Basis;
  asOf?: AsOfSpec;
  range?: RangeSpec;
  adjust?: PriceAdjust;
  scale?: Scale;
};

/** 多报告期展开：起止财年内，每年按勾选的期次各生成一列 */
export type PeriodSlot = "Q1" | "Q2" | "Q3" | "Q4" | "FY";
export type MultiPeriod = { fromYear: number; toYear: number; slots: PeriodSlot[] };

export type ColumnSpec = {
  key: string;
  indicatorId: string;
  params: ColumnParams;
  /** 同一次多报告期展开生成的列共享 groupId，修改参数时整组生效 */
  groupId?: string;
  /** 该组的展开规则（只在组内每一列上重复记录，供再次编辑时回填） */
  multi?: MultiPeriod;
};

export type IndicatorUnit = "money" | "pct" | "perShare" | "shares" | "multiple" | "text" | "date";

export type ParamKind = "period" | "basis" | "asOf" | "range" | "adjust";

export type IndicatorDef = {
  id: string;
  label: string;
  /** 指标树路径（不含叶子本身） */
  path: string[];
  unit: IndicatorUnit;
  params: ParamKind[];
  /** 鼠标悬停说明 */
  note?: string;
};

/**
 * 单元格状态（spec §4.1）：
 * ok=有值；na=公司未披露该科目；noPeriod=没有所选报告期；uncovered=不在基本面覆盖范围；
 * notApplicable=指标对该证券无意义（如 ETF 的报表科目）；noPrice=截止日附近没有行情；
 * noValue=数据在但算不出（如 TTM 凑不齐 4 季、历史不足一年算不了 Beta）。
 */
export type CellStatus = "ok" | "na" | "noPeriod" | "uncovered" | "notApplicable" | "noPrice" | "noValue";

export type Cell = {
  v: number | string | null;
  s: CellStatus;
  /** 实际取到的报告期标签（如 FY2025、FY2025 Q3），行情类为实际交易日或区间 */
  p?: string;
  /** 该期的财报截止日 YYYY-MM-DD */
  d?: string;
};

export type StockDataRow = { symbol: string; name: string; cells: Record<string, Cell> };

export type StockDataResponse = {
  rows: StockDataRow[];
  /** 不是美股、已被剔除的代码 */
  ignored: string[];
  generatedAt: string;
};

export const CELL_STATUS_LABELS: Record<Exclude<CellStatus, "ok">, string> = {
  na: "未披露",
  noPeriod: "无此期",
  uncovered: "未覆盖",
  notApplicable: "不适用",
  noPrice: "无行情",
  noValue: "无法计算",
};
