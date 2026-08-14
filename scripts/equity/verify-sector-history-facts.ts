import { prisma } from "../../src/lib/prisma";
import { loadSectorHistoricalFactGates } from "../../src/lib/equity/sectorHistoricalFactGates";

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function main() {
  const date = arg("date") ?? new Date().toISOString().slice(0, 10);
  const [vintageCount, classificationCount, holdingCount, holdingDates, overlaps] = await Promise.all([
    prisma.equityFundamentalVintage.count(),
    prisma.equitySectorClassificationHistory.count(),
    prisma.sectorEtfHolding.count(),
    prisma.sectorEtfHolding.groupBy({
      by: ["etf", "asOfDate"],
      _sum: { weight: true },
      _count: { _all: true },
      orderBy: [{ asOfDate: "desc" }, { etf: "asc" }],
      take: 24,
    }),
    prisma.$queryRaw<Array<{ symbol: string; scheme: string; overlap_count: bigint }>>`
      SELECT a.symbol, a.scheme, COUNT(*) AS overlap_count
      FROM mds.equity_sector_classification_history a
      JOIN mds.equity_sector_classification_history b
        ON a.symbol = b.symbol AND a.scheme = b.scheme AND a.id < b.id
       AND a.valid_from <= COALESCE(b.valid_to, '9999-12-31'::date)
       AND b.valid_from <= COALESCE(a.valid_to, '9999-12-31'::date)
      GROUP BY a.symbol, a.scheme
    `,
  ]);
  console.log(`rows: filing_vintage=${vintageCount}, classification=${classificationCount}, etf_holdings=${holdingCount}`);
  for (const snapshot of holdingDates) {
    const weight = snapshot._sum.weight ?? 0;
    console.log(`${snapshot.etf} ${snapshot.asOfDate.toISOString().slice(0, 10)} rows=${snapshot._count._all} weight=${(weight * 100).toFixed(3)}%`);
    if (weight < 0.9 || weight > 1.05) throw new Error(`${snapshot.etf} 权重合计未通过验收`);
  }
  if (overlaps.length) throw new Error(`分类有效期存在 ${overlaps.length} 组重叠`);

  const gates = await loadSectorHistoricalFactGates(date, date);
  for (const gate of gates.values()) {
    console.log(
      `${gate.etf}: vintage=${(gate.filingVintage.coverage * 100).toFixed(1)}% ` +
      `gics=${(gate.historicalClassification.coverage * 100).toFixed(1)}% ` +
      `holdings=${(gate.etfHoldings.coverage * 100).toFixed(1)}% strict=${gate.strict}`,
    );
  }
  if (process.argv.includes("--strict") && [...gates.values()].some((gate) => !gate.strict)) {
    throw new Error(`${date} 尚有行业未通过三层严格事实闸门`);
  }
}

main().finally(() => prisma.$disconnect());
