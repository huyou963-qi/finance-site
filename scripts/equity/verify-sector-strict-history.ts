import { prisma } from "../../src/lib/prisma";
import { GICS_SECTOR_DEFS } from "../../src/lib/equity/gicsCatalog";
import { loadSectorHistoricalFactGates } from "../../src/lib/equity/sectorHistoricalFactGates";
import {
  computeStrictEtfReturnBridge,
  loadStrictEtfSectorSnapshots,
} from "../../src/lib/equity/sectorStrictHistorical";

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function main() {
  const etf = (arg("etf") ?? "XLK").trim().toUpperCase();
  const definition = GICS_SECTOR_DEFS.find((item) => item.etf === etf);
  if (!definition) throw new Error(`unknown Sector ETF: ${etf}`);
  const latestHolding = await prisma.sectorEtfHolding.findFirst({
    where: { etf },
    orderBy: { asOfDate: "desc" },
    select: { asOfDate: true },
  });
  const date = arg("date") ?? latestHolding?.asOfDate.toISOString().slice(0, 10);
  if (!date) throw new Error(`${etf} has no holding snapshot`);

  const gates = await loadSectorHistoricalFactGates(date, date);
  const gate = gates.get(definition.sector)!;
  if (!gate.strict) {
    throw new Error(
      `${etf} strict gate failed at ${date}: vintage=${pct(gate.filingVintage.coverage)}, ` +
      `gics=${pct(gate.historicalClassification.coverage)}, holdings=${pct(gate.etfHoldings.coverage)}`,
    );
  }

  const snapshots = await loadStrictEtfSectorSnapshots(date, [definition.sector]);
  const snapshot = snapshots.get(definition.sector);
  if (!snapshot) throw new Error(`${etf} strict endpoint was not rebuilt`);
  if (snapshot.holdingAsOfDate > date) throw new Error("holding snapshot leaks beyond endpoint T");
  if (snapshot.latestFilingDateUsed && snapshot.latestFilingDateUsed > date) {
    throw new Error("filing vintage selection leaks beyond endpoint T");
  }
  const classificationCoverage = snapshot.holdingTotalWeight > 0
    ? snapshot.classifiedWeight / snapshot.holdingTotalWeight
    : 0;
  const vintageCoverage = snapshot.holdingTotalWeight > 0
    ? snapshot.vintageWeight / snapshot.holdingTotalWeight
    : 0;
  if (classificationCoverage < 0.95) throw new Error("rebuilt classification coverage below 95%");
  if (vintageCoverage < 0.8) throw new Error("rebuilt filing-vintage coverage below 80%");
  const coreMetrics = ["revenueYoY", "opMargin", "earningsYield"] as const;
  for (const key of coreMetrics) {
    const metric = snapshot.metrics[key];
    if (metric?.value == null || (metric.coverage ?? 0) < 0.6) {
      throw new Error(`${etf} ${key} failed the 60% strict metric coverage check`);
    }
  }

  const bridge = computeStrictEtfReturnBridge({
    totalReturn: 0,
    priceReturn: 0,
    start: snapshot,
    end: snapshot,
  });
  if (!bridge.available || bridge.method !== "etf-holdings-matched-start-weight") {
    throw new Error(`${etf} strict bridge was not available`);
  }
  const sum = bridge.fundamentalContribution! + bridge.valuationContribution! +
    bridge.dividendContribution! + bridge.residual!;
  if (Math.abs(sum - bridge.totalLogReturn!) > 1e-12) {
    throw new Error(`strict bridge additive identity failed: ${sum} != ${bridge.totalLogReturn}`);
  }

  console.log(JSON.stringify({
    etf,
    sector: definition.sector,
    endpoint: date,
    holdingSnapshot: snapshot.holdingAsOfDate,
    latestFilingDateUsed: snapshot.latestFilingDateUsed,
    holdingWeight: pct(snapshot.holdingTotalWeight),
    classificationCoverage: pct(classificationCoverage),
    vintageCoverage: pct(vintageCoverage),
    constituents: snapshot.constituents.length,
    priced: snapshot.pricedCount,
    metrics: Object.fromEntries(coreMetrics.map((key) => [key, snapshot.metrics[key]])),
    bridge: {
      basis: bridge.basis,
      matchedCoverage: pct(bridge.coverage ?? 0),
      additiveError: sum - bridge.totalLogReturn!,
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
