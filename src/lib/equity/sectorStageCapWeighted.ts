import { prisma } from "@/lib/prisma";
import {
  GICS_SECTORS,
  normalizeGicsSector,
  type GicsSector,
} from "@/lib/equity/gicsCatalog";

export const CAP_WEIGHTED_FACTOR_KEYS = [
  "revenueYoY",
  "revenueAccel",
  "epsYoY",
  "grossMargin",
  "opMargin",
  "roeTtm",
  "ocfToNetIncome",
  "accrualsToAssets",
  "debtToAssets",
  "earningsYield",
  "salesYield",
  "fcfYield",
  "ocfToEv",
  "dividendYield",
  "bookYield",
] as const;

const REQUIRED_FACTOR_KEYS = ["logMarketCap", ...CAP_WEIGHTED_FACTOR_KEYS] as const;

export type CapWeightedMetricPoint = {
  value: number | null;
  coverage: number | null;
  sampleCount: number | null;
};

export type CapWeightedBridgeBasisPoint = {
  flow: number | null;
  marketCap: number | null;
  coverage: number | null;
  sampleCount: number;
};

export type CapWeightedSectorSnapshot = {
  sector: GicsSector;
  date: string;
  universeCount: number;
  pricedCount: number;
  totalMarketCap: number | null;
  metrics: Record<string, CapWeightedMetricPoint>;
  bridgeBases: {
    earnings: CapWeightedBridgeBasisPoint;
    sales: CapWeightedBridgeBasisPoint;
    cashFlow: CapWeightedBridgeBasisPoint;
  };
};

export type SectorReturnBridge = {
  available: boolean;
  method: "market-cap-total" | "etf-holdings-matched-start-weight";
  basis: "earnings" | "sales" | "cashFlow" | null;
  basisLabel: string | null;
  totalLogReturn: number | null;
  priceLogReturn: number | null;
  fundamentalContribution: number | null;
  valuationContribution: number | null;
  dividendContribution: number | null;
  residual: number | null;
  coverage: number | null;
  holdingSnapshotStart: string | null;
  holdingSnapshotEnd: string | null;
  warnings: string[];
};

export type CapWeightedFactorRow = {
  symbol: string;
  factorKey: string;
  value: number;
};

function finite(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function emptyMetric(): CapWeightedMetricPoint {
  return { value: null, coverage: null, sampleCount: null };
}

function aggregateWeightedMetric(
  symbols: readonly string[],
  factorsBySymbol: ReadonlyMap<string, ReadonlyMap<string, number>>,
  factorKey: string,
  totalMarketCap: number,
): CapWeightedMetricPoint {
  let weightedSum = 0;
  let coveredMarketCap = 0;
  let sampleCount = 0;
  for (const symbol of symbols) {
    const factors = factorsBySymbol.get(symbol);
    const logMarketCap = factors?.get("logMarketCap");
    const value = factors?.get(factorKey);
    if (!finite(logMarketCap) || !finite(value)) continue;
    const marketCap = Math.exp(logMarketCap);
    if (!Number.isFinite(marketCap) || marketCap <= 0) continue;
    weightedSum += value * marketCap;
    coveredMarketCap += marketCap;
    sampleCount += 1;
  }
  if (!(coveredMarketCap > 0) || !(totalMarketCap > 0)) return emptyMetric();
  return {
    value: weightedSum / coveredMarketCap,
    coverage: coveredMarketCap / totalMarketCap,
    sampleCount,
  };
}

function bridgeBasis(
  symbols: readonly string[],
  factorsBySymbol: ReadonlyMap<string, ReadonlyMap<string, number>>,
  yieldFactorKey: "earningsYield" | "salesYield" | "fcfYield",
  totalMarketCap: number,
): CapWeightedBridgeBasisPoint {
  let flow = 0;
  let coveredMarketCap = 0;
  let sampleCount = 0;
  for (const symbol of symbols) {
    const factors = factorsBySymbol.get(symbol);
    const logMarketCap = factors?.get("logMarketCap");
    const yieldValue = factors?.get(yieldFactorKey);
    if (!finite(logMarketCap) || !finite(yieldValue)) continue;
    const marketCap = Math.exp(logMarketCap);
    if (!Number.isFinite(marketCap) || marketCap <= 0) continue;
    flow += yieldValue * marketCap;
    coveredMarketCap += marketCap;
    sampleCount += 1;
  }
  return {
    flow: sampleCount ? flow : null,
    marketCap: sampleCount ? coveredMarketCap : null,
    coverage: totalMarketCap > 0 ? coveredMarketCap / totalMarketCap : null,
    sampleCount,
  };
}

/**
 * 月度 FactorSnapshot 已由 buildPitCrossSection 以 firstReportedAt<=T 构建。
 * 估值收益率 × PIT 市值可还原公司 TTM 流量，行业层先求和再计算收益率，
 * 因而不会落入“平均公司 PE”的错误口径。
 */
export function aggregateCapWeightedFactorRows(
  date: string,
  rows: readonly CapWeightedFactorRow[],
  sectorBySymbol: ReadonlyMap<string, GicsSector>,
): Map<GicsSector, CapWeightedSectorSnapshot> {
  const factorsBySymbol = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!Number.isFinite(row.value)) continue;
    const factors = factorsBySymbol.get(row.symbol) ?? new Map<string, number>();
    factors.set(row.factorKey, row.value);
    factorsBySymbol.set(row.symbol, factors);
  }

  const symbolsBySector = new Map<GicsSector, string[]>(
    GICS_SECTORS.map((sector) => [sector, []]),
  );
  for (const symbol of factorsBySymbol.keys()) {
    const sector = sectorBySymbol.get(symbol);
    if (sector) symbolsBySector.get(sector)!.push(symbol);
  }

  return new Map(
    GICS_SECTORS.map((sector) => {
      const symbols = symbolsBySector.get(sector) ?? [];
      const pricedSymbols = symbols.filter((symbol) => {
        const logMarketCap = factorsBySymbol.get(symbol)?.get("logMarketCap");
        return finite(logMarketCap) && Number.isFinite(Math.exp(logMarketCap));
      });
      const totalMarketCap = sum(
        pricedSymbols.map((symbol) =>
          Math.exp(factorsBySymbol.get(symbol)!.get("logMarketCap")!),
        ),
      );
      const metrics = Object.fromEntries(
        CAP_WEIGHTED_FACTOR_KEYS.map((factorKey) => [
          factorKey,
          aggregateWeightedMetric(
            pricedSymbols,
            factorsBySymbol,
            factorKey,
            totalMarketCap,
          ),
        ]),
      );
      return [
        sector,
        {
          sector,
          date,
          universeCount: symbols.length,
          pricedCount: pricedSymbols.length,
          totalMarketCap: totalMarketCap > 0 ? totalMarketCap : null,
          metrics,
          bridgeBases: {
            earnings: bridgeBasis(
              pricedSymbols,
              factorsBySymbol,
              "earningsYield",
              totalMarketCap,
            ),
            sales: bridgeBasis(
              pricedSymbols,
              factorsBySymbol,
              "salesYield",
              totalMarketCap,
            ),
            cashFlow: bridgeBasis(
              pricedSymbols,
              factorsBySymbol,
              "fcfYield",
              totalMarketCap,
            ),
          },
        } satisfies CapWeightedSectorSnapshot,
      ];
    }),
  );
}

export async function loadCapWeightedSnapshots(
  date: string,
): Promise<Map<GicsSector, CapWeightedSectorSnapshot>> {
  const factorRows = await prisma.factorSnapshot.findMany({
    where: {
      date: new Date(`${date}T00:00:00.000Z`),
      factorKey: { in: [...REQUIRED_FACTOR_KEYS] },
    },
    select: { symbol: true, factorKey: true, value: true },
  });
  const symbols = [...new Set(factorRows.map((row) => row.symbol))];
  const securities = symbols.length
    ? await prisma.equitySecurity.findMany({
        where: { symbol: { in: symbols } },
        select: { symbol: true, gicsSector: true },
      })
    : [];
  const sectorBySymbol = new Map<string, GicsSector>();
  for (const security of securities) {
    const sector = normalizeGicsSector(security.gicsSector);
    if (sector) sectorBySymbol.set(security.symbol, sector);
  }
  return aggregateCapWeightedFactorRows(date, factorRows, sectorBySymbol);
}

function positiveFinite(value: number | null): value is number {
  return finite(value) && value > 0;
}

/**
 * 对数收益桥：ETF 总回报 = 基本面 + 估值 + 实际分红 + 残差。
 * 分红贡献由 split-adjusted close 与含分红 adjClose 的差异反推；
 * 残差显式保留 ETF 权重、成分调整、股本变化、分类近似与时间错位。
 */
export function computeSectorReturnBridge(input: {
  totalReturn: number | null;
  priceReturn: number | null;
  start: CapWeightedSectorSnapshot | null;
  end: CapWeightedSectorSnapshot | null;
}): SectorReturnBridge {
  const totalLogReturn =
    input.totalReturn != null && input.totalReturn > -1
      ? Math.log1p(input.totalReturn)
      : null;
  const priceLogReturn =
    input.priceReturn != null && input.priceReturn > -1
      ? Math.log1p(input.priceReturn)
      : null;
  const dividendContribution =
    totalLogReturn != null && priceLogReturn != null
      ? totalLogReturn - priceLogReturn
      : null;
  if (!input.start || !input.end || totalLogReturn == null || dividendContribution == null) {
    return {
      available: false,
      method: "market-cap-total",
      basis: null,
      basisLabel: null,
      totalLogReturn,
      priceLogReturn,
      fundamentalContribution: null,
      valuationContribution: null,
      dividendContribution,
      residual: null,
      coverage: null,
      holdingSnapshotStart: null,
      holdingSnapshotEnd: null,
      warnings: ["收益桥缺少端点行业总量或 ETF 价格/总回报序列。"],
    };
  }

  const candidates = [
    {
      key: "earnings" as const,
      label: "TTM 盈利",
      start: input.start.bridgeBases.earnings,
      end: input.end.bridgeBases.earnings,
    },
    {
      key: "sales" as const,
      label: "TTM 营收",
      start: input.start.bridgeBases.sales,
      end: input.end.bridgeBases.sales,
    },
    {
      key: "cashFlow" as const,
      label: "TTM 自由现金流",
      start: input.start.bridgeBases.cashFlow,
      end: input.end.bridgeBases.cashFlow,
    },
  ];
  const selected = candidates.find(
    (candidate) =>
      positiveFinite(candidate.start.flow) &&
      positiveFinite(candidate.end.flow) &&
      positiveFinite(candidate.start.marketCap) &&
      positiveFinite(candidate.end.marketCap) &&
      (candidate.start.coverage ?? 0) >= 0.6 &&
      (candidate.end.coverage ?? 0) >= 0.6,
  );
  if (!selected) {
    return {
      available: false,
      method: "market-cap-total",
      basis: null,
      basisLabel: null,
      totalLogReturn,
      priceLogReturn,
      fundamentalContribution: null,
      valuationContribution: null,
      dividendContribution,
      residual: null,
      coverage: null,
      holdingSnapshotStart: null,
      holdingSnapshotEnd: null,
      warnings: ["盈利、营收与自由现金流均未同时满足正值和 60% 市值覆盖，收益桥停止分解。"],
    };
  }

  const fundamentalContribution = Math.log(selected.end.flow! / selected.start.flow!);
  const startMultiple = selected.start.marketCap! / selected.start.flow!;
  const endMultiple = selected.end.marketCap! / selected.end.flow!;
  const valuationContribution = Math.log(endMultiple / startMultiple);
  const residual =
    totalLogReturn - fundamentalContribution - valuationContribution - dividendContribution;
  const coverage = Math.min(selected.start.coverage!, selected.end.coverage!);
  const warnings: string[] = [];
  if (selected.key !== "earnings") {
    warnings.push(`行业总盈利无法稳定分解，已降级为${selected.label}桥。`);
  }
  if (Math.abs(residual) >= 0.1) {
    warnings.push("残差绝对值超过 10 个对数百分点，ETF 权重/成分与公司总量差异不可忽略。");
  }
  warnings.push("公司总量截面为近似 PIT 且使用当前 GICS；残差不是可交易 alpha。");

  return {
    available: true,
    method: "market-cap-total",
    basis: selected.key,
    basisLabel: selected.label,
    totalLogReturn,
    priceLogReturn,
    fundamentalContribution,
    valuationContribution,
    dividendContribution,
    residual,
    coverage,
    holdingSnapshotStart: null,
    holdingSnapshotEnd: null,
    warnings,
  };
}
