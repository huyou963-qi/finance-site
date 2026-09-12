import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchJpMhlwMonthlyLabourIncremental } from "../../src/lib/data/scheduler/adapters/jpMhlwMonthlyLabourAdapter";
import {
  JP_MHLW_MONTHLY_LABOUR_PROVIDER,
  JP_MHLW_MONTHLY_LABOUR_SERIES,
} from "../../src/lib/data/scheduler/jpMhlwMonthlyLabour/catalog";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const fixtureDir = process.argv.find((arg) => arg.startsWith("--fixture-dir="))?.slice(14);
  for (const series of JP_MHLW_MONTHLY_LABOUR_SERIES) {
    const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: series.instrumentCode } });
    const fixturePath = fixtureDir ? `${fixtureDir}/${series.instrumentCode}.xlsx` : undefined;
    const result = await fetchJpMhlwMonthlyLabourIncremental(
      { scrape: { provider: JP_MHLW_MONTHLY_LABOUR_PROVIDER, fixturePath } },
      series.instrumentCode,
      "1990-01-01",
    );
    const outcome = await upsertMacroObservations(prisma, instrument.id, result.points, {
      vintageSource: "jp_mhlw_monthly_labour_backfill",
    });
    console.log(series.instrumentCode, result.points.length, outcome);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "MHLW monthly labour sync failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
