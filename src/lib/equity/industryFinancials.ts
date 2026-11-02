/** ETF 成分财务派生视图。只消费已有持仓和季度事实，不抓取、不写库。 */
import { computeTtm, type QuarterFundamentalRow } from "./ttm";

export type FinancialBasis = "Q" | "TTM";
export type MembershipBasis = "current" | "historical";
export type FinancialHolding = { symbol: string | null; cusip: string | null; name: string; weight: number };
export type FinancialSecurity = { symbol: string; cik: string | null; cusip: string | null; name: string };
export type FinancialSnapshot = {
  symbol: string; period: string; fiscalDate: string;
  revenue: number | null; netIncome: number | null; ocf: number | null; capex: number | null;
};
export type FinancialUniverse = {
  date: string; holdings: FinancialHolding[];
};
export type FinancialMetric = {
  value: number | null; sampleCount: number; universeCount: number;
  /** 有效公司占该快照股票持仓的权重比例，不含现金。 */
  weightCoverage: number | null;
};
export type FinancialMember = {
  symbol: string; name: string; weight: number; fiscalDate: string | null;
  revenueYoY: number | null; netMargin: number | null; fcf: number | null;
  status: "available" | "partial" | "missing" | "unmapped";
  missingFields: ("revenue" | "netIncome" | "ocf" | "capex")[];
};
export type FinancialPeriod = {
  period: string; basis: FinancialBasis; holdingsDate: string | null;
  universeCount: number; unresolvedCount: number; equityWeight: number;
  revenue: FinancialMetric; revenueYoY: FinancialMetric; netIncome: FinancialMetric; netIncomeYoY: FinancialMetric;
  netMargin: FinancialMetric; ocf: FinancialMetric; capex: FinancialMetric; fcf: FinancialMetric;
  /** 单项原始覆盖率；曲线仍使用两项均齐全的共同样本。 */
  cashSourceCoverage: { ocf: FinancialMetric; capex: FinancialMetric };
  members: FinancialMember[];
};
export type FinancialHistoryPoint = { period: string; Q: FinancialPeriod; TTM: FinancialPeriod };

export function shiftFinancialQuarter(period: string, offset: number): string {
  const match = /^(\d{4})Q([1-4])$/.exec(period);
  if (!match) throw new Error("无效的财报季度");
  const index = Number(match[1]) * 4 + Number(match[2]) - 1 + offset;
  return `${Math.floor(index / 4)}Q${index % 4 + 1}`;
}

export function financialQuarterEnd(period: string): string {
  const year = Number(period.slice(0, 4));
  const quarter = Number(period.slice(-1));
  return new Date(Date.UTC(year, quarter * 3, 0)).toISOString().slice(0, 10);
}

/** 只有目标日前七日内的真实归档才视为该季末持仓，禁止用未来快照补历史。 */
export function selectFinancialHoldingsDate(dates: string[], boundary: string): string | null {
  const eligible = dates.filter(date => date <= boundary).sort();
  const date = eligible[eligible.length - 1];
  if (!date || Date.parse(boundary) - Date.parse(date) > 7 * 86_400_000) return null;
  return date;
}

type Issuer = { symbol: string; name: string; aliases: string[]; weight: number };
type Flows = { revenue: number | null; netIncome: number | null; ocf: number | null; capex: number | null };
const finite = (value: number | null): value is number => value != null && Number.isFinite(value);

function issuers(holdings: FinancialHolding[], securities: FinancialSecurity[]): Issuer[] {
  const bySymbol = new Map(securities.map(row => [row.symbol, row]));
  const byCusip = new Map(securities.filter(row => row.cusip).map(row => [row.cusip!, row]));
  const cikKey = (value: string | null) => value?.replace(/^0+/, "") || null;
  const byCik = new Map<string, string[]>();
  for (const row of securities) {
    const cik = cikKey(row.cik);
    if (cik) byCik.set(cik, [...(byCik.get(cik) ?? []), row.symbol]);
  }
  const grouped = new Map<string, Issuer>();
  for (const holding of holdings) {
    if (!holding.symbol || /^(USD|CASH|US DOLLAR)$/i.test(holding.symbol)) continue;
    const security = bySymbol.get(holding.symbol) ?? (holding.cusip ? byCusip.get(holding.cusip) : undefined);
    const cik = cikKey(security?.cik ?? null);
    const key = cik ? `cik:${cik}` : `symbol:${security?.symbol ?? holding.symbol}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.weight += holding.weight;
      continue;
    }
    grouped.set(key, {
      symbol: security?.symbol ?? holding.symbol,
      name: security?.name ?? holding.name,
      aliases: security ? [security.symbol, ...(cik ? byCik.get(cik)!.filter(symbol => symbol !== security.symbol) : [])] : [],
      weight: holding.weight,
    });
  }
  return [...grouped.values()];
}

/** 最近四个自然季度必须逐季齐全，同时复用个股 TTM 的实际财季连续性检查。 */
function flowsAt(rows: Map<string, FinancialSnapshot>, period: string, basis: FinancialBasis): Flows | null {
  const latest = rows.get(period);
  if (!latest) return null;
  if (basis === "Q") return latest;
  const window: QuarterFundamentalRow[] = [];
  for (let offset = -3; offset <= 0; offset++) {
    const row = rows.get(shiftFinancialQuarter(period, offset));
    if (!row) return null;
    window.push({
      ...row, eps: null, dividendsPaid: null, buybackPaid: null, totalAssets: null,
      totalLiabilities: null, equity: null, longTermDebt: null, cash: null, sharesOutstanding: null,
    });
  }
  return computeTtm(window);
}

export function buildIndustryFinancialHistory(input: {
  periods: string[]; membership: MembershipBasis; current: FinancialUniverse | null;
  historical: Map<string, FinancialUniverse>; securities: FinancialSecurity[]; snapshots: FinancialSnapshot[];
}): FinancialHistoryPoint[] {
  const bySymbol = new Map<string, Map<string, FinancialSnapshot>>();
  for (const snapshot of input.snapshots) {
    if (!bySymbol.has(snapshot.symbol)) bySymbol.set(snapshot.symbol, new Map());
    bySymbol.get(snapshot.symbol)!.set(snapshot.period, snapshot);
  }
  const score = (row: FinancialSnapshot) => [row.revenue, row.netIncome, row.ocf, row.capex].filter(finite).length;
  function periodView(period: string, basis: FinancialBasis, universe: FinancialUniverse | null): FinancialPeriod {
    const members = universe ? issuers(universe.holdings, input.securities) : [];
    const weight = members.reduce((sum, row) => sum + row.weight, 0);
    const values = members.map(member => {
      // 多股类按同一发行人合并；优先代表代码，缺失时使用该 CIK 下的可用季度事实。
      const rows = new Map<string, FinancialSnapshot>();
      for (const alias of member.aliases) {
        for (const [key, row] of bySymbol.get(alias) ?? []) {
          if (!rows.has(key) || score(row) > score(rows.get(key)!)) rows.set(key, row);
        }
      }
      return { member, current: flowsAt(rows, period, basis), previous: flowsAt(rows, shiftFinancialQuarter(period, -4), basis), fiscalDate: rows.get(period)?.fiscalDate ?? null };
    });
    type Value = typeof values[number];
    function metric(select: (row: Value) => number | null, numerator?: (selected: Value[]) => number | null): FinancialMetric {
      const selected = values.filter(row => finite(select(row)));
      return {
        value: selected.length ? (numerator ? numerator(selected) : selected.reduce((sum, row) => sum + select(row)!, 0)) : null,
        sampleCount: selected.length, universeCount: members.length,
        weightCoverage: weight > 0 ? selected.reduce((sum, row) => sum + row.member.weight, 0) / weight : null,
      };
    }
    const cashReady = (row: Value) => row.current && finite(row.current.ocf) && finite(row.current.capex);
    const view: FinancialPeriod = {
      period, basis, holdingsDate: universe?.date ?? null, universeCount: members.length,
      unresolvedCount: members.filter(row => !row.aliases.length).length, equityWeight: weight,
      revenue: metric(row => row.current?.revenue ?? null),
      revenueYoY: metric(row => row.current && row.previous && finite(row.current.revenue) && finite(row.previous.revenue) && row.previous.revenue > 0 ? row.current.revenue : null,
        selected => selected.reduce((sum, row) => sum + row.current!.revenue!, 0) / selected.reduce((sum, row) => sum + row.previous!.revenue!, 0) - 1),
      netIncome: metric(row => row.current?.netIncome ?? null),
      netIncomeYoY: metric(row => row.current && row.previous && finite(row.current.netIncome) && finite(row.previous.netIncome) ? row.current.netIncome : null,
        selected => {
          const previous = selected.reduce((sum, row) => sum + row.previous!.netIncome!, 0);
          return previous === 0 ? null : (selected.reduce((sum, row) => sum + row.current!.netIncome!, 0) - previous) / Math.abs(previous);
        }),
      netMargin: metric(row => row.current && finite(row.current.revenue) && row.current.revenue > 0 && finite(row.current.netIncome) ? row.current.netIncome : null,
        selected => selected.reduce((sum, row) => sum + row.current!.netIncome!, 0) / selected.reduce((sum, row) => sum + row.current!.revenue!, 0)),
      // 三条现金流线严格使用同一子样本，确保 FCF = OCF - CapEx。
      ocf: metric(row => cashReady(row) ? row.current!.ocf : null),
      capex: metric(row => cashReady(row) ? row.current!.capex : null),
      fcf: metric(row => cashReady(row) ? row.current!.ocf! - row.current!.capex! : null),
      cashSourceCoverage: {
        ocf: metric(row => row.current?.ocf ?? null),
        capex: metric(row => row.current?.capex ?? null),
      },
      members: values.map<FinancialMember>(({ member, current, previous, fiscalDate }) => ({
        symbol: member.symbol, name: member.name, weight: member.weight, fiscalDate,
        revenueYoY: current && previous && finite(current.revenue) && finite(previous.revenue) && previous.revenue > 0 ? current.revenue / previous.revenue - 1 : null,
        netMargin: current && finite(current.netIncome) && finite(current.revenue) && current.revenue > 0 ? current.netIncome / current.revenue : null,
        fcf: current && finite(current.ocf) && finite(current.capex) ? current.ocf - current.capex : null,
        status: !member.aliases.length ? "unmapped" : !current ? "missing" : [current.revenue, current.netIncome, current.ocf, current.capex].every(finite) ? "available" : "partial",
        missingFields: (["revenue", "netIncome", "ocf", "capex"] as const).filter(field => !finite(current?.[field] ?? null)),
      })).sort((a, b) => b.weight - a.weight || a.symbol.localeCompare(b.symbol)),
    };
    return view;
  }
  return input.periods.map(period => {
    const universe = input.membership === "current" ? input.current : input.historical.get(period) ?? null;
    return { period, Q: periodView(period, "Q", universe), TTM: periodView(period, "TTM", universe) };
  });
}
