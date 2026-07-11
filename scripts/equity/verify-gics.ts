/**
 * 校验 GICS Industry 目录与 DB 回卷覆盖率。
 * Usage: npm run equity:verify-gics [-- --db]
 */
import { prisma } from "../../src/lib/prisma";
import {
  assertGicsIndustryCatalog,
  GICS_INDUSTRIES,
} from "../../src/lib/equity/gicsIndustryCatalog";

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  assertGicsIndustryCatalog();

  const report: Record<string, unknown> = {
    ok: true,
    industries: GICS_INDUSTRIES.length,
    styleTagged: GICS_INDUSTRIES.filter((i) => i.code).length,
  };

  if (hasFlag("--db")) {
    const total = await prisma.equitySecurity.count();
    const withIndustryCode = await prisma.equitySecurity.count({
      where: { gicsIndustryCode: { not: null } },
    });
    const withSubIndustry = await prisma.equitySecurity.count({
      where: { gicsSubIndustry: { not: null } },
    });
    const unmapped = await prisma.equitySecurity.findMany({
      where: { gicsIndustryCode: null },
      select: { symbol: true, gicsSubIndustry: true, gicsSector: true },
      take: 20,
      orderBy: { symbol: "asc" },
    });

    const rollupRate = total > 0 ? withIndustryCode / total : 0;
    report.db = {
      total,
      withIndustryCode,
      withSubIndustry,
      rollupRate,
      unmappedSamples: unmapped,
    };

    if (rollupRate < 0.99) {
      report.ok = false;
      console.error(`GICS 回卷率 ${(rollupRate * 100).toFixed(1)}% < 99%`);
      process.exitCode = 1;
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
