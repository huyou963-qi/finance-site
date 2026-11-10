/**
 * 「股票数据」取数的纯函数部分：给定已读出的证券信息与季度快照，算出每个单元格。
 * 全部口径复用 fundamentalRatios / statementTemplate / overviewDimensions，这里只做「选期 + 取值」。
 */

import {
  aggregateFiscalYears,
  aggregateTrailingFour,
  computeQuarterRatios,
  withStatementDerived,
  type FiscalYearRow,
  type QuarterRatioPoint,
} from "@/lib/equity/fundamentalRatios";
import type { QuarterSnapshotRow } from "@/lib/equity/equityFundamentalsStore";
import { computeFfoPerShareTtm } from "@/lib/equity/overviewDimensions";
import {
  detectStatementProfile,
  STATEMENT_PROFILE_NAMES,
  type StatementLine,
} from "@/lib/equity/statementTemplate";
import { GICS_SECTOR_DEFS } from "@/lib/equity/gicsCatalog";
import { getIndicator, normalizeParams, type RatioField, type SecurityField } from "./indicatorRegistry";
import type { MarketResolver } from "./marketResolve";
import type { Cell, ColumnSpec, PeriodSpec, StockDataRow } from "./types";

export type SecurityInfo = {
  name: string | null;
  exchange: string | null;
  gicsSector: string | null;
  gicsIndustryGroup: string | null;
  gicsIndustry: string | null;
  gicsSubIndustry: string | null;
  marketCap: number | null;
  website: string | null;
};

export type SymbolInput = {
  symbol: string;
  /** ETF 等基金：报表类指标不适用 */
  isFund: boolean;
  security: SecurityInfo;
  /** 升序季度快照；空数组 = 不在基本面覆盖范围 */
  quarters: QuarterSnapshotRow[];
};

type FiscalPos = { year: number; q: number };

type Prepared = {
  quarters: QuarterSnapshotRow[];
  fiscalYears: FiscalYearRow[];
  ratios: QuarterRatioPoint[];
  ffo: (number | null)[];
  positions: (FiscalPos | null)[];
};

const SECTOR_ZH = new Map(GICS_SECTOR_DEFS.map((d) => [d.sector as string, d.nameZh]));

/** 无法按财年分组时的兜底：用财季位置推出财年末所在年份，或退化为日历季度 */
function fallbackPosition(row: QuarterSnapshotRow): FiscalPos {
  const y = Number(row.fiscalDate.slice(0, 4));
  const m = Number(row.fiscalDate.slice(5, 7));
  const fq = row.fiscalQuarter;
  if (fq != null && fq >= 1 && fq <= 4) {
    const months = y * 12 + (m - 1) + (4 - fq) * 3;
    return { year: Math.floor(months / 12), q: fq };
  }
  return { year: y, q: Math.ceil(m / 3) };
}

/**
 * 每个季度属于哪个财年的第几季：以 aggregateFiscalYears 的分组为准（与年报列完全对齐），
 * 最后一个完整财年之后的季度依次记为下一财年的 Q1–Q3，其余用兜底规则。
 */
export function quarterPositions(quarters: readonly QuarterSnapshotRow[], fiscalYears: readonly FiscalYearRow[]): (FiscalPos | null)[] {
  const index = new Map(quarters.map((r, i) => [r.period, i]));
  const pos: (FiscalPos | null)[] = quarters.map(() => null);
  let lastEnd = -1;
  let lastYear = 0;
  for (const fy of fiscalYears) {
    const year = Number(fy.period.slice(2));
    fy.quarterPeriods.forEach((p, k) => {
      const i = index.get(p);
      if (i != null) pos[i] = { year, q: k + 1 };
      if (i != null && k === 3 && i > lastEnd) { lastEnd = i; lastYear = year; }
    });
  }
  for (let i = 0; i < quarters.length; i++) {
    if (pos[i]) continue;
    const n = i - lastEnd;
    pos[i] = lastEnd >= 0 && n >= 1 && n <= 3 ? { year: lastYear + 1, q: n } : fallbackPosition(quarters[i]!);
  }
  return pos;
}

function prepare(quarters: QuarterSnapshotRow[]): Prepared {
  const fiscalYears = aggregateFiscalYears(quarters);
  return {
    quarters,
    fiscalYears,
    ratios: computeQuarterRatios(quarters),
    ffo: computeFfoPerShareTtm(quarters).map((f) => f.ffoPerShareTtm),
    positions: quarterPositions(quarters, fiscalYears),
  };
}

type Located =
  | { type: "FY"; fy: FiscalYearRow; endIndex: number }
  | { type: "Q"; index: number };

function locate(p: Prepared, period: PeriodSpec): Located | null {
  const byFy = (fy: FiscalYearRow | undefined): Located | null => {
    if (!fy) return null;
    const endIndex = p.quarters.findIndex((q) => q.fiscalDate === fy.fiscalDate);
    return { type: "FY", fy, endIndex };
  };
  switch (period.kind) {
    case "latestFY": return byFy(p.fiscalYears[p.fiscalYears.length - 1]);
    case "FY": return byFy(p.fiscalYears.find((fy) => fy.period === `FY${period.year}`));
    case "latestQ": return p.quarters.length ? { type: "Q", index: p.quarters.length - 1 } : null;
    case "FQ": {
      const index = p.positions.findIndex((pos) => pos?.year === period.year && pos.q === period.q);
      return index >= 0 ? { type: "Q", index } : null;
    }
  }
}

function labelOf(p: Prepared, loc: Located): { p: string; d: string } {
  if (loc.type === "FY") return { p: loc.fy.period, d: loc.fy.fiscalDate };
  const pos = p.positions[loc.index]!;
  return { p: `FY${pos.year} Q${pos.q}`, d: p.quarters[loc.index]!.fiscalDate };
}

const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function lineValue(row: object & { lines?: Record<string, number> }, line: StatementLine): number | null {
  const raw = line.headline ? (row as Record<string, unknown>)[line.headline] : row.lines?.[line.code];
  const v = finite(raw);
  if (v == null) return null;
  return line.outflow && v !== 0 ? -v : v;
}

function valueCell(v: number | null, label: { p: string; d: string }): Cell {
  return v == null ? { v: null, s: "na", ...label } : { v, s: "ok", ...label };
}

function statementCell(p: Prepared, line: StatementLine, period: PeriodSpec, basis: "single" | "ttm" | undefined): Cell {
  const loc = locate(p, period);
  if (!loc) return { v: null, s: "noPeriod" };
  const label = labelOf(p, loc);
  if (loc.type === "FY") return valueCell(lineValue(withStatementDerived(loc.fy), line), label);
  const instant = line.kind === "instant" || line.kind === "sharesInstant";
  if (basis === "ttm" && !instant) {
    const ttm = aggregateTrailingFour(p.quarters, loc.index);
    if (!ttm) return { v: null, s: "noPeriod", ...label };
    return valueCell(lineValue(withStatementDerived(ttm), line), label);
  }
  return valueCell(lineValue(withStatementDerived(p.quarters[loc.index]!), line), label);
}

function ratioCell(p: Prepared, field: RatioField, period: PeriodSpec): Cell {
  const loc = locate(p, period);
  if (!loc) return { v: null, s: "noPeriod" };
  const label = labelOf(p, loc);
  const i = loc.type === "FY" ? loc.endIndex : loc.index;
  if (i < 0) return { v: null, s: "na", ...label };
  const v = field === "ffoPerShareTtm" ? p.ffo[i] ?? null : p.ratios[i]?.[field] ?? null;
  return valueCell(finite(v), label);
}

function growthCell(p: Prepared, field: "revenueYoY" | "epsYoY", period: PeriodSpec): Cell {
  const loc = locate(p, period);
  if (!loc) return { v: null, s: "noPeriod" };
  const label = labelOf(p, loc);
  const row = loc.type === "FY" ? loc.fy : p.quarters[loc.index]!;
  return valueCell(finite(row[field]), label);
}

function securityCell(input: SymbolInput, p: Prepared | null, field: SecurityField): Cell {
  const text = (v: string | null | undefined): Cell => (v ? { v, s: "ok" } : { v: null, s: "na" });
  const s = input.security;
  switch (field) {
    case "name": return text(s.name);
    case "exchange": return text(s.exchange);
    case "gicsSector": return text(s.gicsSector ? SECTOR_ZH.get(s.gicsSector) ?? s.gicsSector : null);
    case "gicsIndustryGroup": return text(s.gicsIndustryGroup);
    case "gicsIndustry": return text(s.gicsIndustry);
    case "gicsSubIndustry": return text(s.gicsSubIndustry);
    case "marketCap": return s.marketCap != null ? { v: s.marketCap, s: "ok" } : { v: null, s: "na" };
    case "website": return text(s.website);
  }
  if (input.isFund) return { v: null, s: "notApplicable" };
  if (!p) return { v: null, s: "uncovered" };
  const last = p.quarters[p.quarters.length - 1]!;
  switch (field) {
    case "statementProfile": return text(STATEMENT_PROFILE_NAMES[detectStatementProfile(p.quarters)]);
    case "latestFiscalDate": return text(last.fiscalDate);
    case "latestReportedAt": return text(last.firstReportedAt);
  }
}

/**
 * 计算一只股票的全部列（列定义已通过 parseColumns 校验）。
 * 行情、估值、趋势类交给 market（没有这类列时可不传）。
 */
export function resolveRow(input: SymbolInput, columns: readonly ColumnSpec[], market?: MarketResolver): StockDataRow {
  let prepared: Prepared | null | undefined;
  const getPrepared = () => {
    if (prepared === undefined) prepared = input.quarters.length ? prepare(input.quarters) : null;
    return prepared;
  };
  const cells: Record<string, Cell> = {};
  for (const col of columns) {
    const def = getIndicator(col.indicatorId);
    if (!def) continue;
    const src = def.source;
    if (src.kind === "security") {
      cells[col.key] = securityCell(input, src.field === "statementProfile" || src.field.startsWith("latest") ? getPrepared() : null, src.field);
      continue;
    }
    if (src.kind === "price" || src.kind === "trend" || src.kind === "valuation") {
      const params = normalizeParams(def, col.params);
      cells[col.key] = !market
        ? { v: null, s: "noPrice" }
        : src.kind === "price"
          ? market.priceCell(src.field, params)
          : src.kind === "trend"
            ? market.trend(src.key, params)
            : market.valuation(src.field, params);
      continue;
    }
    if (input.isFund) { cells[col.key] = { v: null, s: "notApplicable" }; continue; }
    const p = getPrepared();
    if (!p) { cells[col.key] = { v: null, s: "uncovered" }; continue; }
    const params = normalizeParams(def, col.params);
    const period = params.period!;
    if (src.kind === "statement") cells[col.key] = statementCell(p, src.line, period, params.basis);
    else if (src.kind === "ratio") cells[col.key] = ratioCell(p, src.field, period);
    else cells[col.key] = growthCell(p, src.field, period);
  }
  return { symbol: input.symbol, name: input.security.name ?? input.symbol, cells };
}

/** 本次查询最早需要读到哪一年的季度：选定期之前还要 2 年用于 TTM、同比和期间平均 */
export function earliestYearNeeded(columns: readonly ColumnSpec[], currentYear: number): number {
  let min = currentYear - 2;
  for (const col of columns) {
    const p = col.params.period;
    if (p && (p.kind === "FY" || p.kind === "FQ")) min = Math.min(min, p.year - 1);
  }
  return min - 2;
}
