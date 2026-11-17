/**
 * 「股票数据」列模板：系统内置模板（写在代码里，spec §5）与用户模板的校验。纯函数，前后端共用。
 */

import { buildColumns } from "./columns";
import { getIndicator, publicIndicator } from "./indicatorRegistry";
import { parseColumns, parseSymbols, StockDataRequestError } from "./request";
import { MAX_SYMBOLS, type ColumnParams, type ColumnSpec, type MultiPeriod } from "./types";

export const MAX_TEMPLATES = 50;
export const MAX_TEMPLATE_NAME = 60;

export type StockDataTemplate = {
  id: string;
  name: string;
  columns: ColumnSpec[];
  symbols: string[] | null;
  updatedAt?: string;
  system?: boolean;
};

type Item = { id: string; params?: ColumnParams; multi?: MultiPeriod };

const THIS_YEAR = new Date().getFullYear();
const threeYears: MultiPeriod = { fromYear: THIS_YEAR - 3, toYear: THIS_YEAR - 1, slots: ["FY"] };
const latestQ = { period: { kind: "latestQ" as const } };

const SYSTEM: { id: string; name: string; items: Item[] }[] = [
  {
    id: "sys:valuation",
    name: "估值快照",
    items: [
      "sec.gicsSector",
      "val.marketCap",
      "val.pe",
      "val.pb",
      "val.ps",
      "val.evToOcf",
      "val.earningsYield",
      "val.dividendYield",
      "val.fcfYield",
    ].map((id) => ({ id })),
  },
  {
    id: "sys:income3y",
    name: "三年利润表",
    items: ["fs.revenue", "fs.grossProfit", "fs.operatingIncome", "fs.ebitda", "fs.netIncome", "fs.eps"].map((id) => ({
      id,
      multi: threeYears,
    })),
  },
  {
    id: "sys:quality",
    name: "质量与回报",
    items: [
      "ratio.roeTtm",
      "ratio.roaTtm",
      "ratio.netMarginTtm",
      "fs.grossMargin",
      "fs.opMargin",
      "ratio.debtRatio",
      "ratio.currentRatio",
      "ratio.ocfToNetIncome",
      "ratio.accrualsToAssets",
      "ratio.payoutRatioTtm",
      "ratio.buybackRate",
      "growth.revenueYoY",
      "growth.epsYoY",
      "growth.revenueAccel",
    ].map((id) => ({ id, params: latestQ })),
  },
  {
    id: "sys:growth",
    name: "成长快照",
    items: [
      { id: "sec.gicsSector" },
      { id: "fs.revenue", params: latestQ },
      { id: "fs.netIncome", params: latestQ },
      { id: "fs.eps", params: latestQ },
      { id: "growth.revenueYoY", params: latestQ },
      { id: "growth.epsYoY", params: latestQ },
      { id: "growth.revenueAccel", params: latestQ },
      { id: "trend.ret12m" },
      { id: "trend.mom12_1" },
    ],
  },
  {
    id: "sys:trend",
    name: "趋势与风险",
    items: [
      { id: "px.close" },
      { id: "px.rangeReturn", params: { range: { kind: "preset", preset: "ytd" } } },
      ...[
        "trend.ret1m",
        "trend.ret3m",
        "trend.ret12m",
        "trend.mom12_1",
        "trend.dist52wHigh",
        "trend.vol60d",
        "trend.beta252d",
        "trend.maxDrawdown12m",
      ].map((id) => ({ id })),
    ],
  },
  {
    id: "sys:technical",
    name: "技术常用",
    items: [
      { id: "px.close" },
      { id: "tech.sma20" },
      { id: "tech.sma60" },
      { id: "tech.smaBias20" },
      { id: "tech.rsi14" },
      { id: "tech.macdDif" },
      { id: "tech.macdDea" },
      { id: "tech.macdHist" },
      { id: "trend.ret1m" },
      { id: "trend.ret3m" },
    ],
  },
];

/** 系统模板展开成具体的列（每次应用都生成新的列标识） */
export function systemTemplates(newKey: () => string): StockDataTemplate[] {
  return SYSTEM.map((t) => ({
    id: t.id,
    name: t.name,
    system: true,
    symbols: null,
    columns: t.items.flatMap((it) => {
      const def = getIndicator(it.id);
      return def ? buildColumns(publicIndicator(def), it.params ?? {}, it.multi, newKey) : [];
    }),
  }));
}

/** 用户模板的写入校验：名称、列（与查询同一套校验）、可选的股票列表 */
export function parseTemplateInput(body: unknown): { name: string; columns: ColumnSpec[]; symbols: string[] | null } {
  const o = (body ?? {}) as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) throw new StockDataRequestError("请填写模板名称");
  if (name.length > MAX_TEMPLATE_NAME) throw new StockDataRequestError(`模板名称最多 ${MAX_TEMPLATE_NAME} 个字`);
  const columns = parseColumns(o.columns);
  let symbols: string[] | null = null;
  if (Array.isArray(o.symbols) && o.symbols.length) {
    symbols = parseSymbols(o.symbols).symbols.slice(0, MAX_SYMBOLS);
  }
  return { name, columns, symbols };
}

/** 库里读出的模板：列定义随注册表演进，读出时再校验一遍，失效的列丢掉 */
export function readStoredColumns(raw: unknown): ColumnSpec[] {
  if (!Array.isArray(raw)) return [];
  const valid = raw.filter((c) => c && typeof c === "object" && getIndicator((c as ColumnSpec).indicatorId));
  try {
    return valid.length ? parseColumns(valid) : [];
  } catch {
    return [];
  }
}
