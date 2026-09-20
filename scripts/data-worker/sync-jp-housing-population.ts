import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchEStatIncremental } from "../../src/lib/data/scheduler/adapters/eStatAdapter";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
import {
  buildJpHousingPopulationMetadata,
  JP_HOUSING_POPULATION_ESTAT_SERIES,
  JP_MLIT_PROPERTY_PRICE_SERIES,
} from "../../src/lib/data/scheduler/jpHousingPopulation/catalog";
import { fetchJpMlitPropertyPriceWorkbook, parseJpMlitNationalResidentialPriceIndex } from "../../src/lib/data/scheduler/jpHousingPopulation/propertyPrice";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  for (const series of JP_HOUSING_POPULATION_ESTAT_SERIES) {
    const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: series.instrumentCode } });
    const result = await fetchEStatIncremental(series.eStat.statsDataId, series.eStat.historyStart, buildJpHousingPopulationMetadata(series));
    console.log(series.instrumentCode, await upsertMacroObservations(prisma, instrument.id, result.points, { vintageSource: "jp_housing_population_estat" }), result.points.at(-1)?.obsDate.toISOString().slice(0, 10));
  }
  const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: JP_MLIT_PROPERTY_PRICE_SERIES.instrumentCode } });
  const fixture = process.argv.find((arg) => arg.startsWith("--property-price-fixture="))?.slice("--property-price-fixture=".length);
  const points = parseJpMlitNationalResidentialPriceIndex(await fetchJpMlitPropertyPriceWorkbook(fixture));
  console.log(JP_MLIT_PROPERTY_PRICE_SERIES.instrumentCode, await upsertMacroObservations(prisma, instrument.id, points, { vintageSource: "jp_mlit_property_price_workbook" }), points.at(-1)?.obsDate.toISOString().slice(0, 10));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
