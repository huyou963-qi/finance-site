import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  JP_ESTAT_HOUSEHOLD_SERIES,
  buildJpEStatHouseholdMetadata,
} from "../../src/lib/data/scheduler/eStat/householdCatalog";
import { fetchEStatIncremental } from "../../src/lib/data/scheduler/adapters/eStatAdapter";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  for (const series of JP_ESTAT_HOUSEHOLD_SERIES) {
    const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: series.instrumentCode } });
    const result = await fetchEStatIncremental(
      series.eStat.statsDataId,
      "1950-01-01",
      buildJpEStatHouseholdMetadata(series),
    );
    const write = await upsertMacroObservations(prisma, instrument.id, result.points, {
      vintageSource: "jp_estat_household_backfill",
    });
    console.log(
      series.instrumentCode,
      write,
      result.points[0]?.obsDate.toISOString(),
      result.points.at(-1)?.obsDate.toISOString(),
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Household Survey sync failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
