import { prisma } from "@/lib/prisma";
import { GICS_SECTOR_DEFS, type GicsSector } from "@/lib/equity/gicsCatalog";

export type FactLayerEndpoint = {
  date: string;
  coverage: number;
  snapshotDate: string | null;
  lagDays: number | null;
  sampleCount: number;
};

export type FactLayerGate = {
  strict: boolean;
  coverage: number;
  threshold: number;
  endpoints: FactLayerEndpoint[];
};

export type SectorHistoricalFactGate = {
  sector: GicsSector;
  etf: string;
  strict: boolean;
  filingVintage: FactLayerGate;
  historicalClassification: FactLayerGate;
  etfHoldings: FactLayerGate;
  warnings: string[];
};

type WeightedSymbol = { symbol: string; weight: number };

const DAY_MS = 86_400_000;
export const FILING_VINTAGE_THRESHOLD = 0.8;
export const CLASSIFICATION_THRESHOLD = 0.95;
export const ETF_HOLDING_THRESHOLD = 0.95;
export const ETF_HOLDING_MAX_LAG_DAYS = 7;

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function iso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function lagDays(date: string, snapshotDate: string): number {
  return Math.round((utcDate(date).getTime() - utcDate(snapshotDate).getTime()) / DAY_MS);
}

export function evaluateFactLayerGate(
  endpoints: readonly FactLayerEndpoint[],
  threshold: number,
  requireFreshSnapshot = false,
): FactLayerGate {
  const coverage = endpoints.length ? Math.min(...endpoints.map((point) => point.coverage)) : 0;
  const fresh = !requireFreshSnapshot || endpoints.every(
    (point) => point.snapshotDate != null && point.lagDays != null && point.lagDays <= ETF_HOLDING_MAX_LAG_DAYS,
  );
  return {
    strict: endpoints.length >= 2 && coverage >= threshold && fresh,
    coverage,
    threshold,
    endpoints: [...endpoints],
  };
}

function weightedCoverage(
  universe: readonly WeightedSymbol[],
  predicate: (symbol: string) => boolean,
): { coverage: number; sampleCount: number } {
  const denominator = universe.reduce((sum, row) => sum + row.weight, 0);
  let numerator = 0;
  let sampleCount = 0;
  for (const row of universe) {
    if (!predicate(row.symbol)) continue;
    numerator += row.weight;
    sampleCount += 1;
  }
  return {
    coverage: denominator > 0 ? Math.min(1, numerator / denominator) : 0,
    sampleCount,
  };
}

async function loadEndpoint(
  date: string,
): Promise<Map<GicsSector, {
  filingVintage: FactLayerEndpoint;
  historicalClassification: FactLayerEndpoint;
  etfHoldings: FactLayerEndpoint;
}>> {
  const boundary = utcDate(date);
  const fallbackSecurities = await prisma.equitySecurity.findMany({
    where: { gicsSector: { in: GICS_SECTOR_DEFS.map((definition) => definition.sector) } },
    select: { symbol: true, gicsSector: true },
  });
  const fallbackBySector = new Map<GicsSector, string[]>();
  for (const definition of GICS_SECTOR_DEFS) fallbackBySector.set(definition.sector, []);
  for (const security of fallbackSecurities) {
    const sector = security.gicsSector as GicsSector;
    fallbackBySector.get(sector)?.push(security.symbol);
  }

  const etfs = GICS_SECTOR_DEFS.map((definition) => definition.etf);
  const latestSnapshots = await prisma.$queryRaw<Array<{ etf: string; asOfDate: Date }>>`
    SELECT DISTINCT ON (etf) etf, as_of_date AS "asOfDate"
    FROM mds.sector_etf_holding
    WHERE etf = ANY(${etfs}) AND as_of_date <= ${boundary}::date
    ORDER BY etf, as_of_date DESC
  `;
  const latestByEtf = new Map(latestSnapshots.map((row) => [row.etf, row.asOfDate]));
  const holdingRows = latestSnapshots.length
    ? await prisma.sectorEtfHolding.findMany({
        where: {
          OR: latestSnapshots.map((row) => ({ etf: row.etf, asOfDate: row.asOfDate })),
        },
        select: { etf: true, symbol: true, weight: true },
      })
    : [];
  const snapshots = new Map<string, { date: string; rows: WeightedSymbol[]; totalWeight: number }>();
  for (const definition of GICS_SECTOR_DEFS) {
    const snapshotDate = latestByEtf.get(definition.etf);
    if (!snapshotDate) continue;
    const rows = holdingRows.filter((row) => row.etf === definition.etf);
    snapshots.set(definition.etf, {
      date: iso(snapshotDate),
      rows: rows.flatMap((row) => row.symbol && row.weight > 0 ? [{ symbol: row.symbol, weight: row.weight }] : []),
      totalWeight: rows.reduce((sum, row) => sum + row.weight, 0),
    });
  }

  const universes = new Map<GicsSector, WeightedSymbol[]>();
  for (const definition of GICS_SECTOR_DEFS) {
    const snapshot = snapshots.get(definition.etf);
    if (snapshot?.rows.length) {
      universes.set(definition.sector, snapshot.rows);
      continue;
    }
    const symbols = fallbackBySector.get(definition.sector) ?? [];
    const weight = symbols.length ? 1 / symbols.length : 0;
    universes.set(definition.sector, symbols.map((symbol) => ({ symbol, weight })));
  }
  const allSymbols = [...new Set([...universes.values()].flat().map((row) => row.symbol))];
  const [vintages, classifications] = allSymbols.length
    ? await Promise.all([
        prisma.equityFundamentalVintage.findMany({
          where: {
            symbol: { in: allSymbols },
            periodType: "Q",
            filedAt: { lte: boundary },
            fiscalDate: { lte: boundary },
          },
          distinct: ["symbol", "period"],
          select: { symbol: true, period: true },
        }),
        prisma.equitySectorClassificationHistory.findMany({
          where: {
            symbol: { in: allSymbols },
            scheme: "gics",
            validFrom: { lte: boundary },
            OR: [{ validTo: null }, { validTo: { gte: boundary } }],
          },
          select: { symbol: true, sector: true, confidence: true },
        }),
      ])
    : [[], []];
  const vintagePeriods = new Map<string, Set<string>>();
  for (const row of vintages) {
    const periods = vintagePeriods.get(row.symbol) ?? new Set<string>();
    periods.add(row.period);
    vintagePeriods.set(row.symbol, periods);
  }
  const classificationBySymbol = new Map(
    classifications.map((row) => [row.symbol, { sector: row.sector, confidence: row.confidence }]),
  );

  return new Map(GICS_SECTOR_DEFS.map((definition) => {
    const universe = universes.get(definition.sector) ?? [];
    const snapshot = snapshots.get(definition.etf);
    const filing = weightedCoverage(universe, (symbol) => (vintagePeriods.get(symbol)?.size ?? 0) >= 4);
    const classification = weightedCoverage(universe, (symbol) => {
      const row = classificationBySymbol.get(symbol);
      return row?.sector === definition.sector && row.confidence >= 0.8;
    });
    const snapshotLag = snapshot ? lagDays(date, snapshot.date) : null;
    const holdingCoverage = snapshot && snapshotLag! <= ETF_HOLDING_MAX_LAG_DAYS
      ? Math.min(1, snapshot.totalWeight)
      : 0;
    return [definition.sector, {
      filingVintage: { date, coverage: filing.coverage, snapshotDate: null, lagDays: null, sampleCount: filing.sampleCount },
      historicalClassification: { date, coverage: classification.coverage, snapshotDate: null, lagDays: null, sampleCount: classification.sampleCount },
      etfHoldings: { date, coverage: holdingCoverage, snapshotDate: snapshot?.date ?? null, lagDays: snapshotLag, sampleCount: snapshot?.rows.length ?? 0 },
    }];
  }));
}

export async function loadSectorHistoricalFactGates(
  startDate: string | null,
  endDate: string | null,
): Promise<Map<GicsSector, SectorHistoricalFactGate>> {
  if (!startDate || !endDate) {
    return new Map(GICS_SECTOR_DEFS.map((definition) => [definition.sector, missingGate(definition.sector, definition.etf)]));
  }
  const [start, end] = await Promise.all([loadEndpoint(startDate), loadEndpoint(endDate)]);
  return new Map(GICS_SECTOR_DEFS.map((definition) => {
    const startPoint = start.get(definition.sector)!;
    const endPoint = end.get(definition.sector)!;
    const filingVintage = evaluateFactLayerGate(
      [startPoint.filingVintage, endPoint.filingVintage],
      FILING_VINTAGE_THRESHOLD,
    );
    const historicalClassification = evaluateFactLayerGate(
      [startPoint.historicalClassification, endPoint.historicalClassification],
      CLASSIFICATION_THRESHOLD,
    );
    const etfHoldings = evaluateFactLayerGate(
      [startPoint.etfHoldings, endPoint.etfHoldings],
      ETF_HOLDING_THRESHOLD,
      true,
    );
    const warnings: string[] = [];
    if (!filingVintage.strict) warnings.push("SEC filing vintage 首尾覆盖不足，财报仍使用最新重述值的可见性近似。");
    if (!historicalClassification.strict) warnings.push("历史 GICS 有效期首尾覆盖不足，行业归属仍使用当前分类近似。");
    if (!etfHoldings.strict) warnings.push("ETF 历史持仓首尾快照缺失或陈旧，聚合权重仍使用公司市值代理。");
    return [definition.sector, {
      sector: definition.sector,
      etf: definition.etf,
      strict: filingVintage.strict && historicalClassification.strict && etfHoldings.strict,
      filingVintage,
      historicalClassification,
      etfHoldings,
      warnings,
    }];
  }));
}

function missingLayer(threshold: number): FactLayerGate {
  return { strict: false, coverage: 0, threshold, endpoints: [] };
}

function missingGate(sector: GicsSector, etf: string): SectorHistoricalFactGate {
  return {
    sector,
    etf,
    strict: false,
    filingVintage: missingLayer(FILING_VINTAGE_THRESHOLD),
    historicalClassification: missingLayer(CLASSIFICATION_THRESHOLD),
    etfHoldings: missingLayer(ETF_HOLDING_THRESHOLD),
    warnings: ["阶段端点不足，无法验证严格历史事实层。"],
  };
}

export function combineHistoricalFactGates(
  gates: readonly SectorHistoricalFactGate[],
): SectorHistoricalFactGate | null {
  if (!gates.length) return null;
  const combineLayer = (select: (gate: SectorHistoricalFactGate) => FactLayerGate): FactLayerGate => {
    const layers = gates.map(select);
    const endpointDates = [...new Set(layers.flatMap((layer) => layer.endpoints.map((point) => point.date)))];
    const endpoints = endpointDates.map((date) => {
      const points = layers.flatMap((layer) => layer.endpoints.filter((point) => point.date === date));
      const snapshotDates = [...new Set(points.map((point) => point.snapshotDate).filter((value): value is string => Boolean(value)))];
      return {
        date,
        coverage: points.length ? points.reduce((sum, point) => sum + point.coverage, 0) / points.length : 0,
        snapshotDate: snapshotDates.length === 1 ? snapshotDates[0]! : null,
        lagDays: points.length ? Math.max(...points.map((point) => point.lagDays ?? 0)) : null,
        sampleCount: points.reduce((sum, point) => sum + point.sampleCount, 0),
      };
    });
    return {
      strict: layers.every((layer) => layer.strict),
      coverage: layers.reduce((sum, layer) => sum + layer.coverage, 0) / layers.length,
      threshold: layers[0]!.threshold,
      endpoints,
    };
  };
  const filingVintage = combineLayer((gate) => gate.filingVintage);
  const historicalClassification = combineLayer((gate) => gate.historicalClassification);
  const etfHoldings = combineLayer((gate) => gate.etfHoldings);
  return {
    sector: gates[0]!.sector,
    etf: "ALL",
    strict: filingVintage.strict && historicalClassification.strict && etfHoldings.strict,
    filingVintage,
    historicalClassification,
    etfHoldings,
    warnings: [...new Set(gates.flatMap((gate) => gate.warnings))],
  };
}
