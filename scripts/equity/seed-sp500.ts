/**
 * Seed S&P 500 constituents from Wikipedia into mds.equity_security + index_constituent.
 * Usage: npm run equity:seed-sp500
 */
import { prisma } from "../../src/lib/prisma";
import { normalizeGicsSector } from "../../src/lib/equity/gicsCatalog";
import { rollupFromSubIndustry } from "../../src/lib/equity/gicsIndustryCatalog";
import { fetchWikipediaSp500 } from "../../src/lib/equity/wikipediaSp500";
import { SP500_INDEX_CODE } from "../../src/lib/equity/equitySecurities";

async function main() {
  const rows = await fetchWikipediaSp500();
  const asOf = new Date();
  asOf.setUTCHours(0, 0, 0, 0);

  let upserted = 0;
  let skipped = 0;
  let unmappedSubIndustry = 0;
  const bySector: Record<string, number> = {};
  const unmappedSamples: string[] = [];

  for (const row of rows) {
    const sector = normalizeGicsSector(row.sector);
    if (!sector) {
      console.warn(`跳过未知 sector: ${row.symbol} / ${row.sector}`);
      skipped += 1;
      continue;
    }
    bySector[sector] = (bySector[sector] ?? 0) + 1;

    const rollup = rollupFromSubIndustry(row.subIndustry);
    if (!rollup) {
      unmappedSubIndustry += 1;
      if (unmappedSamples.length < 15) {
        unmappedSamples.push(`${row.symbol}:${row.subIndustry}`);
      }
    } else if (rollup.sector !== sector) {
      console.warn(
        `Sector 不一致 ${row.symbol}: wiki=${sector} rollup=${rollup.sector} sub=${row.subIndustry}`,
      );
    }

    const gicsPayload = rollup
      ? {
          gicsIndustryGroup: rollup.industryGroup,
          gicsIndustry: rollup.industry,
          gicsSubIndustry: rollup.subIndustry,
          gicsIndustryCode: rollup.industryCode,
        }
      : {
          gicsIndustryGroup: null,
          gicsIndustry: null,
          gicsSubIndustry: row.subIndustry || null,
          gicsIndustryCode: null,
        };

    await prisma.equitySecurity.upsert({
      where: { symbol: row.symbol },
      create: {
        symbol: row.symbol,
        name: row.name,
        gicsSector: sector,
        ...gicsPayload,
      },
      update: {
        name: row.name,
        gicsSector: sector,
        ...gicsPayload,
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
        unmappedSubIndustry,
        unmappedSamples,
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
