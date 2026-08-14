import { prisma } from "../../src/lib/prisma";
import { fetchSecCompanyFacts } from "../../src/lib/equity/secFundamentals";
import {
  buildSecFundamentalVintages,
  upsertFundamentalVintages,
} from "../../src/lib/equity/fundamentalVintages";

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function main() {
  const requested = new Set(
    (arg("symbols") ?? "")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
  );
  const limit = Math.max(1, Number(arg("limit") ?? 500));
  const maxQuarters = Math.max(8, Number(arg("max-quarters") ?? 80));
  const emitLastFilings = Math.max(1, Number(arg("last-filings") ?? 80));
  const dryRun = process.argv.includes("--dry-run");
  const securities = await prisma.equitySecurity.findMany({
    where: {
      cik: { not: null },
      ...(requested.size ? { symbol: { in: [...requested] } } : {}),
    },
    orderBy: { symbol: "asc" },
    take: limit,
    select: { symbol: true, cik: true },
  });
  if (!securities.length) throw new Error("没有找到带 CIK 的目标证券");

  let written = 0;
  let failed = 0;
  for (const [index, security] of securities.entries()) {
    try {
      const facts = await fetchSecCompanyFacts(security.cik!, { timeoutMs: 60_000 });
      const rows = buildSecFundamentalVintages(facts, { maxQuarters, emitLastFilings });
      if (!dryRun) written += await upsertFundamentalVintages(security.symbol, rows);
      console.log(`[${index + 1}/${securities.length}] ${security.symbol}: ${rows.length} vintage rows${dryRun ? " (dry-run)" : ""}`);
    } catch (error) {
      failed += 1;
      console.error(`${security.symbol}:`, error instanceof Error ? error.message : error);
    }
  }
  console.log(`完成：symbols=${securities.length}, rows=${written}, failed=${failed}`);
  if (failed) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
