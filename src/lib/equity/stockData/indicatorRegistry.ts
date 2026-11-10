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
import type { IndicatorDef, IndicatorUnit, ParamKind, PeriodSpec, Basis, ColumnParams } from "./types";

export type SecurityField =
  | "name" | "exchange" | "gicsSector" | "gicsIndustryGroup" | "gicsIndustry" | "gicsSubIndustry"
  | "marketCap" | "website" | "statementProfile" | "latestFiscalDate" | "latestReportedAt";

export type RatioField =
  | "roeTtm" | "roaTtm" | "netMarginTtm" | "assetTurnoverTtm" | "equityMultiplier" | "debtRatio"
  | "netDebt" | "payoutRatioTtm" | "buybackRate" | "bvps" | "fcfPerShareTtm" | "epsTtm" | "ffoPerShareTtm";

export type GrowthField = "revenueYoY" | "epsYoY";

/** 服务端用来分派取数的来源（随定义一起登记，客户端忽略） */
export type IndicatorSource =
  | { kind: "security"; field: SecurityField }
  | { kind: "statement"; line: StatementLine }
  | { kind: "ratio"; field: RatioField }
  | { kind: "growth"; field: GrowthField };

export type RegisteredIndicator = IndicatorDef & { source: IndicatorSource };

const ROOT_INFO = "证券信息";
const ROOT_FS = "财务报表";
const ROOT_FA = "财务指标";

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

/** 填上该指标需要、但请求里缺省的参数，并丢弃它不接受的参数 */
export function normalizeParams(def: IndicatorDef, params: ColumnParams): ColumnParams {
  const out: ColumnParams = {};
  if (def.params.includes("period")) out.period = params.period ?? DEFAULT_PERIOD;
  if (def.params.includes("basis") && out.period && (out.period.kind === "latestQ" || out.period.kind === "FQ")) {
    out.basis = params.basis ?? DEFAULT_BASIS;
  }
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

/** 列头第二行：报告期 · 口径 */
export function columnParamLabel(params: ColumnParams): string {
  const parts: string[] = [];
  if (params.period) parts.push(periodLabel(params.period));
  if (params.basis) parts.push(basisLabel(params.basis));
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
