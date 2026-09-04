import { prisma } from "@/lib/prisma";
import {
  CAP_WEIGHTED_FACTOR_KEYS,
  type CapWeightedBridgeBasisPoint,
  type CapWeightedMetricPoint,
  type CapWeightedSectorSnapshot,
  type SectorReturnBridge,
} from "@/lib/equity/sectorStageCapWeighted";
import { GICS_SECTOR_DEFS, type GicsSector } from "@/lib/equity/gicsCatalog";
import { computeFundamentalFactors } from "@/lib/quant/factorCompute";
import { loadClosesAsOf, type PitEquityRow, type PitQuarterRow } from "@/lib/quant/pitCrossSection";

const DAY_MS = 86_400_000;
const CLOSE_MAX_LAG_DAYS = 7;
const SHARES_LOOKBACK_QUARTERS = 4;
const SHARES_MAX_AGE_DAYS = 500;
const MIN_PLAUSIBLE_MARKET_CAP = 1e8;
const BRIDGE_MIN_COVERAGE = 0.6;

type VintageRow = {
  symbol: string;
  period: string;
  accession: string;
  filedAt: Date;
  fiscalDate: Date | null;
  revenue: number | null;
  revenueYoY: number | null;
  eps: number | null;
  epsYoY: number | null;
  grossMargin: number | null;
  opMargin: number | null;
  netIncome: number | null;
  ocf: number | null;
  capex: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  equity: number | null;
  longTermDebt: number | null;
  cash: number | null;
  sharesOutstanding: number | null;
  dividendsPaid: number | null;
  buybackPaid: number | null;
};

type HoldingRow = {
  etf: string;
  asOfDate: Date;
  symbol: string | null;
  weight: number;
};

export type StrictEtfConstituent = {
  symbol: string;
  weight: number;
  latestFilingAt: string | null;
  marketCap: number | null;
  factors: Record<string, number>;
  flows: {
    earnings: number | null;
    sales: number | null;
    cashFlow: number | null;
  };
};

export type StrictEtfSectorSnapshot = CapWeightedSectorSnapshot & {
  method: "historical-etf-holdings";
  etf: string;
  holdingAsOfDate: string;
  holdingTotalWeight: number;
  classifiedWeight: number;
  vintageWeight: number;
  latestFilingDateUsed: string | null;
  constituents: StrictEtfConstituent[];
};

function iso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function finite(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

function positive(value: number | null | undefined): value is number {
  return finite(value) && value > 0;
}

function emptyMetric(): CapWeightedMetricPoint {
  return { value: null, coverage: 0, sampleCount: 0 };
}

function weightedMetric(
  constituents: readonly StrictEtfConstituent[],
  key: string,
  totalWeight: number,
): CapWeightedMetricPoint {
  let numerator = 0;
  let coveredWeight = 0;
  let sampleCount = 0;
  for (const row of constituents) {
    const factor = row.factors[key];
    if (!finite(factor) || !(row.weight > 0)) continue;
    numerator += row.weight * factor;
    coveredWeight += row.weight;
    sampleCount += 1;
  }
  if (!(coveredWeight > 0) || !(totalWeight > 0)) return emptyMetric();
  return {
    value: numerator / coveredWeight,
    coverage: Math.min(1, coveredWeight / totalWeight),
    sampleCount,
  };
}

function weightedBridgeBasis(
  constituents: readonly StrictEtfConstituent[],
  key: keyof StrictEtfConstituent["flows"],
  totalWeight: number,
): CapWeightedBridgeBasisPoint {
  let weightedFlow = 0;
  let weightedMarketCap = 0;
  let coveredWeight = 0;
  let sampleCount = 0;
  for (const row of constituents) {
    const flow = row.flows[key];
    if (!finite(flow) || !positive(row.marketCap) || !(row.weight > 0)) continue;
    weightedFlow += row.weight * flow;
    weightedMarketCap += row.weight * row.marketCap;
    coveredWeight += row.weight;
    sampleCount += 1;
  }
  return {
    flow: sampleCount ? weightedFlow / coveredWeight : null,
    marketCap: sampleCount ? weightedMarketCap / coveredWeight : null,
    coverage: totalWeight > 0 ? Math.min(1, coveredWeight / totalWeight) : 0,
    sampleCount,
  };
}

export function aggregateStrictEtfSnapshot(input: {
  sector: GicsSector;
  etf: string;
  date: string;
  holdingAsOfDate: string;
  holdingTotalWeight: number;
  classifiedWeight: number;
  vintageWeight: number;
  constituents: readonly StrictEtfConstituent[];
}): StrictEtfSectorSnapshot {
  const totalMarketCap = input.constituents.reduce(
    (sum, row) => sum + (positive(row.marketCap) ? row.marketCap : 0),
    0,
  );
  const pricedCount = input.constituents.filter((row) => positive(row.marketCap)).length;
  return {
    sector: input.sector,
    date: input.date,
    universeCount: input.constituents.length,
    pricedCount,
    totalMarketCap: totalMarketCap > 0 ? totalMarketCap : null,
    metrics: Object.fromEntries(
      CAP_WEIGHTED_FACTOR_KEYS.map((key) => [
        key,
        weightedMetric(input.constituents, key, input.holdingTotalWeight),
      ]),
    ),
    bridgeBases: {
      earnings: weightedBridgeBasis(input.constituents, "earnings", input.holdingTotalWeight),
      sales: weightedBridgeBasis(input.constituents, "sales", input.holdingTotalWeight),
      cashFlow: weightedBridgeBasis(input.constituents, "cashFlow", input.holdingTotalWeight),
    },
    method: "historical-etf-holdings",
    etf: input.etf,
    holdingAsOfDate: input.holdingAsOfDate,
    holdingTotalWeight: input.holdingTotalWeight,
    classifiedWeight: input.classifiedWeight,
    vintageWeight: input.vintageWeight,
    latestFilingDateUsed: input.constituents
      .map((row) => row.latestFilingAt)
      .filter((value): value is string => value != null)
      .sort()
      .at(-1) ?? null,
    constituents: [...input.constituents],
  };
}

function toQuarter(row: VintageRow): PitQuarterRow | null {
  if (!row.fiscalDate) return null;
  return {
    period: row.period,
    fiscalDate: iso(row.fiscalDate),
    revenue: row.revenue,
    netIncome: row.netIncome,
    eps: row.eps,
    ocf: row.ocf,
    capex: row.capex,
    dividendsPaid: row.dividendsPaid,
    buybackPaid: row.buybackPaid,
    totalAssets: row.totalAssets,
    totalLiabilities: row.totalLiabilities,
    equity: row.equity,
    longTermDebt: row.longTermDebt,
    cash: row.cash,
    sharesOutstanding: row.sharesOutstanding,
    grossMargin: row.grossMargin,
    opMargin: row.opMargin,
    revenueYoY: row.revenueYoY,
    epsYoY: row.epsYoY,
    firstReportedAt: iso(row.filedAt),
  };
}

async function buildStrictRows(
  symbols: string[],
  date: string,
): Promise<Map<string, { pit: PitEquityRow; latestFilingAt: string | null }>> {
  if (!symbols.length) return new Map();
  const boundary = utcDate(date);
  const [vintages, closes, splits] = await Promise.all([
    prisma.$queryRaw<VintageRow[]>`
      SELECT DISTINCT ON (symbol, period)
        symbol,
        period,
        accession,
        filed_at AS "filedAt",
        fiscal_date AS "fiscalDate",
        revenue,
        revenue_yoy AS "revenueYoY",
        eps,
        eps_yoy AS "epsYoY",
        gross_margin AS "grossMargin",
        op_margin AS "opMargin",
        net_income AS "netIncome",
        ocf,
        capex,
        total_assets AS "totalAssets",
        total_liabilities AS "totalLiabilities",
        equity,
        long_term_debt AS "longTermDebt",
        cash,
        shares_outstanding AS "sharesOutstanding",
        dividends_paid AS "dividendsPaid",
        buyback_paid AS "buybackPaid"
      FROM mds.equity_fundamental_vintage
      WHERE symbol = ANY(${symbols})
        AND period_type = 'Q'
        AND filed_at <= ${boundary}::date
        AND fiscal_date <= ${boundary}::date
      ORDER BY symbol, period, filed_at DESC, accession DESC
    `,
    loadClosesAsOf(symbols, date),
    prisma.equitySplit.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, exDate: true, ratio: true },
    }),
  ]);

  const vintagesBySymbol = new Map<string, VintageRow[]>();
  for (const row of vintages) {
    const list = vintagesBySymbol.get(row.symbol) ?? [];
    list.push(row);
    vintagesBySymbol.set(row.symbol, list);
  }
  for (const list of vintagesBySymbol.values()) {
    list.sort((left, right) => {
      const leftDate = left.fiscalDate?.getTime() ?? 0;
      const rightDate = right.fiscalDate?.getTime() ?? 0;
      return leftDate - rightDate || left.filedAt.getTime() - right.filedAt.getTime();
    });
  }
  const splitsBySymbol = new Map<string, Array<{ exDate: Date; ratio: number }>>();
  for (const split of splits) {
    if (!(split.ratio > 0) || !Number.isFinite(split.ratio)) continue;
    const list = splitsBySymbol.get(split.symbol) ?? [];
    list.push({ exDate: split.exDate, ratio: split.ratio });
    splitsBySymbol.set(split.symbol, list);
  }

  const boundaryMs = boundary.getTime();
  const result = new Map<string, { pit: PitEquityRow; latestFilingAt: string | null }>();
  for (const symbol of symbols) {
    const sourceRows = vintagesBySymbol.get(symbol) ?? [];
    const quarters = sourceRows.flatMap((row) => {
      const quarter = toQuarter(row);
      return quarter ? [quarter] : [];
    });
    const latestQuarter = quarters.at(-1) ?? null;
    const closePoint = closes.get(symbol) ?? null;
    const closeFresh = closePoint != null &&
      (boundaryMs - utcDate(closePoint.date).getTime()) / DAY_MS <= CLOSE_MAX_LAG_DAYS;
    const close = closeFresh ? closePoint!.close : null;

    let sharesCurrent: number | null = null;
    for (
      let index = sourceRows.length - 1;
      index >= 0 && sourceRows.length - index <= SHARES_LOOKBACK_QUARTERS;
      index -= 1
    ) {
      const row = sourceRows[index]!;
      if (!row.fiscalDate) continue;
      const ageDays = (boundaryMs - row.fiscalDate.getTime()) / DAY_MS;
      if (ageDays > SHARES_MAX_AGE_DAYS) break;
      if (!positive(row.sharesOutstanding)) continue;
      const postFilingSplitFactor = (splitsBySymbol.get(symbol) ?? []).reduce(
        (factor, split) => split.exDate > row.filedAt && split.exDate <= boundary
          ? factor * split.ratio
          : factor,
        1,
      );
      sharesCurrent = row.sharesOutstanding * postFilingSplitFactor;
      break;
    }
    const rawMarketCap = positive(close) && positive(sharesCurrent)
      ? close * sharesCurrent
      : null;
    const marketCap = rawMarketCap != null && rawMarketCap >= MIN_PLAUSIBLE_MARKET_CAP
      ? rawMarketCap
      : null;
    result.set(symbol, {
      pit: {
        symbol,
        quarters,
        latestQuarter,
        close,
        closeDate: closeFresh ? closePoint!.date : null,
        sharesCurrent,
        marketCap,
      },
      latestFilingAt: sourceRows.length
        ? iso(new Date(Math.max(...sourceRows.map((row) => row.filedAt.getTime()))))
        : null,
    });
  }
  return result;
}

/**
 * Rebuild an endpoint only from records observable at T. The caller still owns
 * the all-or-nothing gate decision; this function never silently falls back to
 * current classifications or restated snapshots.
 */
export async function loadStrictEtfSectorSnapshots(
  date: string,
  sectors: readonly GicsSector[] = GICS_SECTOR_DEFS.map((definition) => definition.sector),
): Promise<Map<GicsSector, StrictEtfSectorSnapshot>> {
  const definitions = GICS_SECTOR_DEFS.filter((definition) => sectors.includes(definition.sector));
  if (!definitions.length) return new Map();
  const etfs = definitions.map((definition) => definition.etf);
  const boundary = utcDate(date);
  const latest = await prisma.$queryRaw<Array<{ etf: string; asOfDate: Date }>>`
    SELECT DISTINCT ON (etf) etf, as_of_date AS "asOfDate"
    FROM mds.sector_etf_holding
    WHERE etf = ANY(${etfs}) AND as_of_date <= ${boundary}::date
    ORDER BY etf, as_of_date DESC
  `;
  const snapshotDateByEtf = new Map(latest.map((row) => [row.etf, row.asOfDate]));
  if (!snapshotDateByEtf.size) return new Map();
  const holdings = await prisma.sectorEtfHolding.findMany({
    where: {
      OR: [...snapshotDateByEtf].map(([etf, asOfDate]) => ({ etf, asOfDate })),
    },
    select: { etf: true, asOfDate: true, symbol: true, weight: true },
  }) as HoldingRow[];
  const symbols = [...new Set(
    holdings.flatMap((row) => row.symbol && row.weight > 0 ? [row.symbol] : []),
  )];
  const [classifications, strictRows] = await Promise.all([
    prisma.equitySectorClassificationHistory.findMany({
      where: {
        symbol: { in: symbols },
        scheme: "gics",
        validFrom: { lte: boundary },
        OR: [{ validTo: null }, { validTo: { gte: boundary } }],
      },
      orderBy: [{ symbol: "asc" }, { validFrom: "desc" }],
      select: { symbol: true, sector: true, confidence: true },
    }),
    buildStrictRows(symbols, date),
  ]);
  const classificationBySymbol = new Map<string, { sector: string | null; confidence: number }>();
  for (const row of classifications) {
    if (!classificationBySymbol.has(row.symbol)) {
      classificationBySymbol.set(row.symbol, { sector: row.sector, confidence: row.confidence });
    }
  }
  const result = new Map<GicsSector, StrictEtfSectorSnapshot>();
  for (const definition of definitions) {
    const snapshotDate = snapshotDateByEtf.get(definition.etf);
    if (!snapshotDate) continue;
    const sectorHoldings = holdings.filter((row) => row.etf === definition.etf && row.weight > 0);
    const holdingTotalWeight = sectorHoldings.reduce((sum, row) => sum + row.weight, 0);
    let classifiedWeight = 0;
    let vintageWeight = 0;
    const constituents: StrictEtfConstituent[] = [];
    for (const holding of sectorHoldings) {
      if (!holding.symbol) continue;
      const classification = classificationBySymbol.get(holding.symbol);
      if (classification?.sector !== definition.sector || classification.confidence < 0.8) continue;
      classifiedWeight += holding.weight;
      const strictRow = strictRows.get(holding.symbol);
      if (!strictRow || strictRow.pit.quarters.length < 4) continue;
      vintageWeight += holding.weight;
      const factors = computeFundamentalFactors(strictRow.pit, date);
      const marketCap = strictRow.pit.marketCap;
      constituents.push({
        symbol: holding.symbol,
        weight: holding.weight,
        latestFilingAt: strictRow.latestFilingAt,
        marketCap,
        factors,
        flows: {
          earnings: finite(factors.earningsYield) && positive(marketCap)
            ? factors.earningsYield * marketCap
            : null,
          sales: finite(factors.salesYield) && positive(marketCap)
            ? factors.salesYield * marketCap
            : null,
          cashFlow: finite(factors.fcfYield) && positive(marketCap)
            ? factors.fcfYield * marketCap
            : null,
        },
      });
    }
    result.set(definition.sector, aggregateStrictEtfSnapshot({
      sector: definition.sector,
      etf: definition.etf,
      date,
      holdingAsOfDate: iso(snapshotDate),
      holdingTotalWeight,
      classifiedWeight,
      vintageWeight,
      constituents,
    }));
  }
  return result;
}

type BridgeBasis = keyof StrictEtfConstituent["flows"];

function unavailableBridge(
  totalLogReturn: number | null,
  priceLogReturn: number | null,
  dividendContribution: number | null,
  startDate: string | null,
  endDate: string | null,
  warning: string,
): SectorReturnBridge {
  return {
    available: false,
    method: "etf-holdings-matched-start-weight",
    basis: null,
    basisLabel: null,
    totalLogReturn,
    priceLogReturn,
    fundamentalContribution: null,
    valuationContribution: null,
    dividendContribution,
    residual: null,
    coverage: null,
    holdingSnapshotStart: startDate,
    holdingSnapshotEnd: endDate,
    warnings: [warning],
  };
}

export function computeStrictEtfReturnBridge(input: {
  totalReturn: number | null;
  priceReturn: number | null;
  start: StrictEtfSectorSnapshot | null;
  end: StrictEtfSectorSnapshot | null;
}): SectorReturnBridge {
  const totalLogReturn = input.totalReturn != null && input.totalReturn > -1
    ? Math.log1p(input.totalReturn)
    : null;
  const priceLogReturn = input.priceReturn != null && input.priceReturn > -1
    ? Math.log1p(input.priceReturn)
    : null;
  const dividendContribution = totalLogReturn != null && priceLogReturn != null
    ? totalLogReturn - priceLogReturn
    : null;
  const startDate = input.start?.holdingAsOfDate ?? null;
  const endDate = input.end?.holdingAsOfDate ?? null;
  if (!input.start || !input.end || totalLogReturn == null || dividendContribution == null) {
    return unavailableBridge(
      totalLogReturn,
      priceLogReturn,
      dividendContribution,
      startDate,
      endDate,
      "Strict ETF bridge is missing an endpoint snapshot or ETF total/price return.",
    );
  }
  const endBySymbol = new Map(input.end.constituents.map((row) => [row.symbol, row]));
  const candidates: Array<{ key: BridgeBasis; outputKey: NonNullable<SectorReturnBridge["basis"]>; label: string }> = [
    { key: "earnings", outputKey: "earnings", label: "TTM 盈利" },
    { key: "sales", outputKey: "sales", label: "TTM 营收" },
    { key: "cashFlow", outputKey: "cashFlow", label: "TTM 自由现金流" },
  ];
  let selected: {
    key: BridgeBasis;
    outputKey: NonNullable<SectorReturnBridge["basis"]>;
    label: string;
    pairs: Array<{ start: StrictEtfConstituent; end: StrictEtfConstituent }>;
    coverageStart: number;
    coverageEnd: number;
  } | null = null;
  for (const candidate of candidates) {
    const pairs = input.start.constituents.flatMap((start) => {
      const end = endBySymbol.get(start.symbol);
      return end && positive(start.flows[candidate.key]) && positive(end.flows[candidate.key]) &&
        positive(start.marketCap) && positive(end.marketCap)
        ? [{ start, end }]
        : [];
    });
    const startWeight = pairs.reduce((sum, pair) => sum + pair.start.weight, 0);
    const endWeight = pairs.reduce((sum, pair) => sum + pair.end.weight, 0);
    const coverageStart = input.start.holdingTotalWeight > 0
      ? startWeight / input.start.holdingTotalWeight
      : 0;
    const coverageEnd = input.end.holdingTotalWeight > 0
      ? endWeight / input.end.holdingTotalWeight
      : 0;
    if (coverageStart >= BRIDGE_MIN_COVERAGE && coverageEnd >= BRIDGE_MIN_COVERAGE) {
      selected = { ...candidate, pairs, coverageStart, coverageEnd };
      break;
    }
  }
  if (!selected) {
    return unavailableBridge(
      totalLogReturn,
      priceLogReturn,
      dividendContribution,
      startDate,
      endDate,
      "No positive matched constituent flow reaches 60% ETF weight at both endpoints.",
    );
  }
  const matchedStartWeight = selected.pairs.reduce((sum, pair) => sum + pair.start.weight, 0);
  let fundamentalContribution = 0;
  let valuationContribution = 0;
  for (const pair of selected.pairs) {
    const weight = pair.start.weight / matchedStartWeight;
    const startFlow = pair.start.flows[selected.key]!;
    const endFlow = pair.end.flows[selected.key]!;
    fundamentalContribution += weight * Math.log(endFlow / startFlow);
    valuationContribution += weight * Math.log(
      (pair.end.marketCap! / endFlow) / (pair.start.marketCap! / startFlow),
    );
  }
  const residual = totalLogReturn - fundamentalContribution - valuationContribution - dividendContribution;
  const warnings = [
    "Strict bridge uses matched constituents and normalized start ETF weights; residual retains rebalancing, unmatched holdings, fees and timing mismatch.",
  ];
  if (selected.outputKey !== "earnings") {
    warnings.unshift(`Aggregate earnings were unsuitable; strict bridge downgraded to ${selected.label}.`);
  }
  if (Math.abs(residual) >= 0.1) {
    warnings.push("Residual exceeds 10 log percentage points; do not treat the bridge as exact ETF accounting attribution.");
  }
  return {
    available: true,
    method: "etf-holdings-matched-start-weight",
    basis: selected.outputKey,
    basisLabel: selected.label,
    totalLogReturn,
    priceLogReturn,
    fundamentalContribution,
    valuationContribution,
    dividendContribution,
    residual,
    coverage: Math.min(selected.coverageStart, selected.coverageEnd),
    holdingSnapshotStart: startDate,
    holdingSnapshotEnd: endDate,
    warnings,
  };
}
