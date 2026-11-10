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

export type ColumnParams = { period?: PeriodSpec; basis?: Basis };

export type ColumnSpec = { key: string; indicatorId: string; params: ColumnParams };

export type IndicatorUnit = "money" | "pct" | "perShare" | "shares" | "multiple" | "text" | "date";

export type ParamKind = "period" | "basis";

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
 * notApplicable=指标对该证券无意义（如 ETF 的报表科目）。
 */
export type CellStatus = "ok" | "na" | "noPeriod" | "uncovered" | "notApplicable";

export type Cell = {
  v: number | string | null;
  s: CellStatus;
  /** 实际取到的报告期标签（如 FY2025、FY2025 Q3） */
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
};
