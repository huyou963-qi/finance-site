/**
 * 「股票数据」页的指标目录（浏览器可用：只有 ID、名称、树路径、单位和参数，不含取数规则）。
 *
 * 每个经济口径只登记一次，全部复用现有底座：
 * - 三张报表科目直接由 STATEMENT_LINES 生成（143 个标准化科目 + FCF）；
 * - 财务指标取 fundamentalRatios.computeQuarterRatios 的口径；
 * - 证券信息取 equity_security 与上市目录。
 * 取数实现在 resolve.ts（纯函数）与 query.ts（服务端）。
 */

import {
  STATEMENT_LINES,
  STATEMENT_NAMES,
  type StatementLine,
  type StatementLineKind,
} from "@/lib/equity/statementTemplate";
import type {
  AsOfSpec,
  Basis,
  ColumnParams,
  IndicatorDef,
  IndicatorUnit,
  ParamKind,
  PeriodSpec,
  PriceAdjust,
  RangePreset,
  RangeSpec,
  Scale,
} from "./types";

export type SecurityField =
  | "name" | "exchange" | "gicsSector" | "gicsIndustryGroup" | "gicsIndustry" | "gicsSubIndustry"
  | "marketCap" | "website" | "statementProfile" | "latestFiscalDate" | "latestReportedAt";

export type RatioField =
  | "roeTtm" | "roaTtm" | "netMarginTtm" | "assetTurnoverTtm" | "equityMultiplier" | "debtRatio"
  | "netDebt" | "payoutRatioTtm" | "buybackRate" | "bvps" | "fcfPerShareTtm" | "epsTtm" | "ffoPerShareTtm";

export type GrowthField = "revenueYoY" | "epsYoY";

/** 估值：全部由 factorCompute.computeFundamentalFactors 的收益率口径换算，市值取截止日 */
export type ValuationField =
  | "marketCap" | "pe" | "pb" | "ps" | "evToOcf"
  | "earningsYield" | "fcfYield" | "dividendYield" | "buybackYield";

export type PriceField = "close" | "rangeReturn" | "rangeAmount" | "rangeTurnover";

/** 趋势与风险：factorCompute.computeTechnicalFactors 的输出键 */
export type TrendFactorKey =
  | "ret1m" | "ret3m" | "ret6m" | "ret12m" | "mom12_1" | "dist52wHigh"
  | "vol60d" | "beta252d" | "maxDrawdown12m";

/** 服务端用来分派取数的来源（随定义一起登记，客户端忽略） */
export type IndicatorSource =
  | { kind: "security"; field: SecurityField }
  | { kind: "statement"; line: StatementLine }
  | { kind: "ratio"; field: RatioField }
  | { kind: "growth"; field: GrowthField }
  | { kind: "valuation"; field: ValuationField }
  | { kind: "price"; field: PriceField }
  | { kind: "trend"; key: TrendFactorKey };

export type RegisteredIndicator = IndicatorDef & { source: IndicatorSource };

const ROOT_INFO = "证券信息";
const ROOT_FS = "财务报表";
const ROOT_FA = "财务指标";
const ROOT_VAL = "估值指标";
const ROOT_PX = "行情指标";
const ROOT_TREND = "趋势与风险";

function unitOfLine(kind: StatementLineKind): IndicatorUnit {
  if (kind === "ratio") return "pct";
  if (kind === "perShare") return "perShare";
  if (kind === "sharesFlow" || kind === "sharesInstant") return "shares";
  return "money";
}

/** 期末余额类科目没有单季/TTM 之分 */
function lineParams(kind: StatementLineKind): ParamKind[] {
  return kind === "instant" || kind === "sharesInstant" ? ["period"] : ["period", "basis"];
}

const security = (field: SecurityField, label: string, unit: IndicatorUnit, note?: string): RegisteredIndicator => ({
  id: `sec.${field}`, label, path: [ROOT_INFO], unit, params: [], note, source: { kind: "security", field },
});

const ratio = (group: string, field: RatioField, label: string, unit: IndicatorUnit, note: string): RegisteredIndicator => ({
  id: `ratio.${field}`, label, path: [ROOT_FA, group], unit, params: ["period"], note, source: { kind: "ratio", field },
});

const growth = (field: GrowthField, label: string, note: string): RegisteredIndicator => ({
  id: `growth.${field}`, label, path: [ROOT_FA, "成长能力"], unit: "pct", params: ["period"], note, source: { kind: "growth", field },
});

const valuation = (field: ValuationField, label: string, unit: IndicatorUnit, note: string): RegisteredIndicator => ({
  id: `val.${field}`, label, path: [ROOT_VAL], unit, params: ["asOf"], note, source: { kind: "valuation", field },
});

const price = (field: PriceField, label: string, unit: IndicatorUnit, params: ParamKind[], note: string): RegisteredIndicator => ({
  id: `px.${field}`, label, path: [ROOT_PX], unit, params, note, source: { kind: "price", field },
});

const trend = (group: string, key: TrendFactorKey, label: string, unit: IndicatorUnit, note: string): RegisteredIndicator => ({
  id: `trend.${key}`, label, path: [ROOT_TREND, group], unit, params: ["asOf"], note, source: { kind: "trend", key },
});

export const INDICATORS: readonly RegisteredIndicator[] = [
  security("name", "证券名称", "text"),
  security("exchange", "上市交易所", "text"),
  security("gicsSector", "GICS 一级行业", "text", "仅标普 500 成分有 GICS 分类"),
  security("gicsIndustryGroup", "GICS 二级行业", "text", "仅标普 500 成分有 GICS 分类"),
  security("gicsIndustry", "GICS 三级行业", "text", "仅标普 500 成分有 GICS 分类"),
  security("gicsSubIndustry", "GICS 四级行业", "text", "仅标普 500 成分有 GICS 分类"),
  security("marketCap", "总市值", "money", "最近一次更新的总市值（美元）"),
  security("website", "公司官网", "text"),
  security("statementProfile", "报表格式", "text", "按公司披露的科目判定：一般企业、银行、保险、券商或 REIT"),
  security("latestFiscalDate", "最新报告期截止日", "date"),
  security("latestReportedAt", "最新财报披露日", "date"),

  ...STATEMENT_LINES.map((line): RegisteredIndicator => ({
    id: `fs.${line.code}`,
    label: line.label,
    path: [ROOT_FS, STATEMENT_NAMES[line.statement], line.group],
    unit: unitOfLine(line.kind),
    params: lineParams(line.kind),
    note: line.outflow ? "现金流出按负数显示" : undefined,
    source: { kind: "statement", line },
  })),

  ratio("盈利能力", "roeTtm", "ROE（TTM）", "pct", "滚动 4 季净利润 / 平均股东权益"),
  ratio("盈利能力", "roaTtm", "ROA（TTM）", "pct", "滚动 4 季净利润 / 平均总资产"),
  ratio("盈利能力", "netMarginTtm", "净利率（TTM）", "pct", "滚动 4 季净利润 / 滚动 4 季营收"),
  ratio("营运与杠杆", "assetTurnoverTtm", "总资产周转率（TTM）", "multiple", "滚动 4 季营收 / 平均总资产"),
  ratio("营运与杠杆", "equityMultiplier", "权益乘数", "multiple", "平均总资产 / 平均股东权益"),
  ratio("营运与杠杆", "debtRatio", "资产负债率", "pct", "期末总负债 / 总资产"),
  ratio("营运与杠杆", "netDebt", "净债务", "money", "期末长期债务 − 现金"),
  ratio("股东回报", "payoutRatioTtm", "派息率（TTM）", "pct", "滚动 4 季分红 / 滚动 4 季净利润"),
  ratio("股东回报", "buybackRate", "近 4 季净回购率", "pct", "（4 季前股本 − 期末股本）/ 4 季前股本"),
  ratio("每股指标", "epsTtm", "EPS（TTM）", "perShare", "滚动 4 季稀释 EPS 之和"),
  ratio("每股指标", "bvps", "每股净资产", "perShare", "期末股东权益 / 流通股本"),
  ratio("每股指标", "fcfPerShareTtm", "每股自由现金流（TTM）", "perShare", "滚动 4 季（经营现金流 − 资本开支）/ 流通股本"),
  ratio("每股指标", "ffoPerShareTtm", "每股 FFO（TTM）", "perShare", "REIT 常用：滚动 4 季（净利润 + 折旧摊销 − 投资损益）/ 流通股本"),
  growth("revenueYoY", "营收同比", "年报：比上一财年；季报：比上年同季"),
  growth("epsYoY", "EPS 同比", "年报：比上一财年；季报：比上年同季"),

  valuation("marketCap", "总市值（截止日）", "money", "截止日收盘价 × 截止日前已披露的最新股本"),
  valuation("pe", "市盈率 PE（TTM）", "multiple", "截止日市值 / 截止日前已披露的滚动 4 季净利润；亏损为负"),
  valuation("pb", "市净率 PB", "multiple", "截止日市值 / 截止日前已披露的最新股东权益"),
  valuation("ps", "市销率 PS（TTM）", "multiple", "截止日市值 / 截止日前已披露的滚动 4 季营收"),
  valuation("evToOcf", "EV / 经营现金流（TTM）", "multiple", "（市值 + 长期债务 − 现金）/ 滚动 4 季经营现金流"),
  valuation("earningsYield", "盈利收益率（E/P）", "pct", "滚动 4 季净利润 / 截止日市值，即 PE 的倒数"),
  valuation("fcfYield", "自由现金流收益率", "pct", "滚动 4 季（经营现金流 − 资本开支）/ 截止日市值"),
  valuation("dividendYield", "股息率（TTM）", "pct", "滚动 4 季分红 / 截止日市值"),
  valuation("buybackYield", "回购收益率（TTM）", "pct", "滚动 4 季回购支出 / 截止日市值"),

  price("close", "收盘价", "perShare", ["asOf", "adjust"], "截止日或之前最近一个交易日的收盘价"),
  price("rangeReturn", "区间涨跌幅", "pct", ["range", "adjust"], "区间末收盘价 / 区间开始前一交易日收盘价 − 1；前复权含分红再投资"),
  price("rangeAmount", "区间成交额", "money", ["range"], "区间内每日收盘价 × 成交量之和"),
  price("rangeTurnover", "区间换手率", "pct", ["range"], "区间成交量 / 区间末已披露的最新股本"),

  trend("动量", "ret1m", "近 1 月收益", "pct", "21 个交易日总收益（前复权）"),
  trend("动量", "ret3m", "近 3 月收益", "pct", "63 个交易日总收益（前复权）"),
  trend("动量", "ret6m", "近 6 月收益", "pct", "126 个交易日总收益（前复权）"),
  trend("动量", "ret12m", "近 12 月收益", "pct", "252 个交易日总收益（前复权）"),
  trend("动量", "mom12_1", "12−1 动量", "pct", "截止日前 12 个月到前 1 个月的总收益，剔除最近一个月"),
  trend("动量", "dist52wHigh", "距 52 周高点", "pct", "收盘价 / 252 个交易日内最高收盘价 − 1；0 表示创新高"),
  trend("风险", "vol60d", "60 日年化波动率", "pct", "60 个日对数收益的标准差 × √252"),
  trend("风险", "beta252d", "Beta（252 日）", "multiple", "对标普 500 指数基金日收益回归的斜率，至少需要 200 个重叠交易日"),
  trend("风险", "maxDrawdown12m", "12 月最大回撤", "pct", "252 个交易日内收盘价相对此前最高点的最大跌幅"),
];

const BY_ID = new Map(INDICATORS.map((d) => [d.id, d]));

export function getIndicator(id: string): RegisteredIndicator | undefined {
  return BY_ID.get(id);
}

/** 只发给浏览器的公开字段 */
export function publicIndicator(d: RegisteredIndicator): IndicatorDef {
  return { id: d.id, label: d.label, path: d.path, unit: d.unit, params: d.params, note: d.note };
}

export const DEFAULT_PERIOD: PeriodSpec = { kind: "latestFY" };
export const DEFAULT_BASIS: Basis = "single";
export const DEFAULT_AS_OF: AsOfSpec = { kind: "latest" };
export const DEFAULT_RANGE: RangeSpec = { kind: "preset", preset: "1y" };
export const DEFAULT_ADJUST: PriceAdjust = "forward";

/** 金额、股数类指标可选显示单位 */
export const takesScale = (def: Pick<IndicatorDef, "unit">) => def.unit === "money" || def.unit === "shares";

/** 填上该指标需要、但请求里缺省的参数，并丢弃它不接受的参数 */
export function normalizeParams(def: IndicatorDef, params: ColumnParams): ColumnParams {
  const out: ColumnParams = {};
  if (def.params.includes("period")) out.period = params.period ?? DEFAULT_PERIOD;
  if (def.params.includes("basis") && out.period && (out.period.kind === "latestQ" || out.period.kind === "FQ")) {
    out.basis = params.basis ?? DEFAULT_BASIS;
  }
  if (def.params.includes("asOf")) out.asOf = params.asOf ?? DEFAULT_AS_OF;
  if (def.params.includes("range")) out.range = params.range ?? DEFAULT_RANGE;
  if (def.params.includes("adjust")) out.adjust = params.adjust ?? DEFAULT_ADJUST;
  if (takesScale(def) && params.scale && params.scale !== "auto") out.scale = params.scale;
  return out;
}

export function periodLabel(p: PeriodSpec): string {
  switch (p.kind) {
    case "latestFY": return "最新年报";
    case "latestQ": return "最新一期";
    case "FY": return `FY${p.year} 年报`;
    case "FQ": return `FY${p.year} Q${p.q}`;
  }
}

export function basisLabel(b: Basis): string {
  return b === "ttm" ? "TTM" : "单季";
}

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  "1m": "近 1 月", "3m": "近 3 月", "6m": "近 6 月", ytd: "今年以来", "1y": "近 1 年", "3y": "近 3 年", "5y": "近 5 年",
};

export const SCALE_LABELS: Record<Scale, string> = { auto: "自动", raw: "原值", k: "千", m: "百万", b: "十亿" };

export function asOfLabel(a: AsOfSpec): string {
  return a.kind === "latest" ? "最新" : `截至 ${a.date}`;
}

export function rangeLabel(r: RangeSpec): string {
  return r.kind === "preset" ? RANGE_PRESET_LABELS[r.preset] : `${r.from} 至 ${r.to}`;
}

/** 列头第二行：报告期 · 口径 · 截止日 / 区间 · 复权 */
export function columnParamLabel(params: ColumnParams): string {
  const parts: string[] = [];
  if (params.period) parts.push(periodLabel(params.period));
  if (params.basis) parts.push(basisLabel(params.basis));
  if (params.asOf) parts.push(asOfLabel(params.asOf));
  if (params.range) parts.push(rangeLabel(params.range));
  if (params.adjust) parts.push(params.adjust === "none" ? "不复权" : "前复权");
  return parts.join(" · ");
}

export const UNIT_LABELS: Record<IndicatorUnit, string> = {
  money: "美元",
  pct: "%",
  perShare: "美元/股",
  shares: "股",
  multiple: "倍",
  text: "",
  date: "",
};

export type IndicatorTreeNode = { label: string; children: IndicatorTreeNode[]; indicators: IndicatorDef[] };

/** 按 path 组装成树，保持登记顺序 */
export function buildIndicatorTree(defs: readonly IndicatorDef[]): IndicatorTreeNode {
  const root: IndicatorTreeNode = { label: "", children: [], indicators: [] };
  for (const d of defs) {
    let node = root;
    for (const seg of d.path) {
      let child = node.children.find((c) => c.label === seg);
      if (!child) {
        child = { label: seg, children: [], indicators: [] };
        node.children.push(child);
      }
      node = child;
    }
    node.indicators.push(d);
  }
  return root;
}
