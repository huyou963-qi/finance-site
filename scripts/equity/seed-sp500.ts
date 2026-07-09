/**
 * Seed S&P 500 constituents from Wikipedia into mds.equity_security + index_constituent.
 * Usage: npm run equity:seed-sp500
 */
import { prisma } from "../../src/lib/prisma";
import { normalizeGicsSector } from "../../src/lib/equity/gicsCatalog";
import { fetchWikipediaSp500 } from "../../src/lib/equity/wikipediaSp500";
import { SP500_INDEX_CODE } from "../../src/lib/equity/equitySecurities";

async function main() {
  const rows = await fetchWikipediaSp500();
  const asOf = new Date();
  asOf.setUTCHours(0, 0, 0, 0);

  let upserted = 0;
  let skipped = 0;
  const bySector: Record<string, number> = {};

  for (const row of rows) {
    const sector = normalizeGicsSector(row.sector);
    if (!sector) {
      console.warn(`跳过未知 sector: ${row.symbol} / ${row.sector}`);
      skipped += 1;
      continue;
    }
    bySector[sector] = (bySector[sector] ?? 0) + 1;

    await prisma.equitySecurity.upsert({
      where: { symbol: row.symbol },
      create: {
        symbol: row.symbol,
        name: row.name,
        gicsSector: sector,
        gicsIndustry: row.subIndustry || null,
        gicsSubIndustry: row.subIndustry || null,
      },
      update: {
        name: row.name,
        gicsSector: sector,
        gicsIndustry: row.subIndustry || null,
        gicsSubIndustry: row.subIndustry || null,
      },
    });

    await prisma.indexConstituent.upsert({
      where: {
        indexCode_symbol_asOfDate: {
          indexCode: SP500_INDEX_CODE,
          symbol: row.symbol,
          asOfDate: asOf,
        },
      },
      create: {
        indexCode: SP500_INDEX_CODE,
        symbol: row.symbol,
        asOfDate: asOf,
      },
      update: {},
    });

    upserted += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        upserted,
        skipped,
        asOf: asOf.toISOString().slice(0, 10),
        bySector,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
