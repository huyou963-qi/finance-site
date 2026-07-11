/**
 * 分日增量回填 FMP profile（市值 / CIK / website）。
 * 免费档勿一次拉全量；默认每天最多 --limit=40。
 *
 * Usage:
 *   npm run equity:sync-profiles
 *   npm run equity:sync-profiles -- --limit=20 --only-missing
 */
import { prisma } from "../../src/lib/prisma";
import { fetchFmpProfile } from "../../src/lib/equity/fmpEquity";
import { normalizeGicsSector } from "../../src/lib/equity/gicsCatalog";

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const limit = Math.max(1, Number(argValue("--limit") ?? 40) || 40);
  const onlyMissing = hasFlag("--only-missing");
  const delayMs = Math.max(100, Number(argValue("--delay-ms") ?? 350) || 350);

  const where = onlyMissing
    ? { OR: [{ marketCap: null }, { cik: null }] }
    : {};

  const candidates = await prisma.equitySecurity.findMany({
    where,
    orderBy: [
      { marketCapAsOf: "asc" },
      { updatedAt: "asc" },
      { symbol: "asc" },
    ],
    take: limit,
    select: { symbol: true },
  });

  let ok = 0;
  let fail = 0;
  const asOf = new Date();
  asOf.setUTCHours(0, 0, 0, 0);

  for (const { symbol } of candidates) {
    try {
      const profile = await fetchFmpProfile(symbol);
      if (!profile) {
        fail += 1;
        console.warn(`no profile: ${symbol}`);
        await sleep(delayMs);
        continue;
      }
      const sectorNorm = normalizeGicsSector(profile.sector);
      await prisma.equitySecurity.update({
        where: { symbol },
        data: {
          cik: profile.cik ?? undefined,
          marketCap: profile.marketCap ?? undefined,
          marketCapAsOf: profile.marketCap != null ? asOf : undefined,
          website: profile.website ?? undefined,
          irUrl: profile.irUrl ?? undefined,
          ...(profile.companyName ? { name: profile.companyName } : {}),
          ...(sectorNorm ? { gicsSector: sectorNorm } : {}),
        },
      });
      ok += 1;
      console.log(`ok ${symbol} cap=${profile.marketCap ?? "n/a"}`);
    } catch (e) {
      fail += 1;
      console.warn(`fail ${symbol}:`, e instanceof Error ? e.message : e);
    }
    await sleep(delayMs);
  }

  console.log(JSON.stringify({ attempted: candidates.length, ok, fail }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
