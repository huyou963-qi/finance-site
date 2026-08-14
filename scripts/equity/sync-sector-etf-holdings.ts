import { prisma } from "../../src/lib/prisma";
import { BENCHMARK_ETF, SECTOR_ETF_SYMBOLS } from "../../src/lib/equity/gicsCatalog";
import {
  fetchSsgaDailyHoldings,
  replaceEtfHoldingSnapshot,
} from "../../src/lib/equity/sectorEtfHoldings";

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function main() {
  const etfs = (arg("etfs") ?? [BENCHMARK_ETF, ...SECTOR_ETF_SYMBOLS].join(","))
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  const dryRun = process.argv.includes("--dry-run");
  let failed = 0;
  for (const etf of etfs) {
    try {
      const snapshot = await fetchSsgaDailyHoldings(etf);
      const written = dryRun ? snapshot.rows.length : await replaceEtfHoldingSnapshot(snapshot);
      console.log(`${etf} ${snapshot.asOfDate}: ${written} rows, weight=${(snapshot.totalWeight * 100).toFixed(3)}%${dryRun ? " (dry-run)" : ""}`);
    } catch (error) {
      failed += 1;
      console.error(`${etf}:`, error instanceof Error ? error.message : error);
    }
  }
  if (failed) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
