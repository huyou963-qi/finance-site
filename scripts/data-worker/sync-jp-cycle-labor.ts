import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { JP_CYCLE_LABOR_SERIES, buildJpCycleLaborMetadata } from "../../src/lib/data/scheduler/jpCycleLabor/catalog";
import { fetchJpCycleLaborIncremental } from "../../src/lib/data/scheduler/adapters/jpCycleLaborAdapter";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
loadEnvConfig(process.cwd()); const prisma = new PrismaClient();
async function main() { const fixture = process.argv.find((arg) => arg.startsWith("--fixture="))?.slice(10); for (const series of JP_CYCLE_LABOR_SERIES) { const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: series.instrumentCode } }); const result = await fetchJpCycleLaborIncremental({ ...buildJpCycleLaborMetadata(series), scrape: { provider: "jp_cycle_labor", fixturePath: fixture } }, series.instrumentCode); console.log(series.instrumentCode, result.points.length, await upsertMacroObservations(prisma, instrument.id, result.points, { vintageSource: "jp_cycle_labor_backfill" })); } }
main().catch((error) => { console.error(error instanceof Error ? error.message : "Japan cycle/labor sync failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
