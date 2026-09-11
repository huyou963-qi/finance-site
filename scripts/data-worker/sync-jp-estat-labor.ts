import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { JP_ESTAT_LABOR_SERIES, buildJpEStatLaborMetadata } from "../../src/lib/data/scheduler/eStat/laborCatalog";
import { fetchEStatIncremental } from "../../src/lib/data/scheduler/adapters/eStatAdapter";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  for (const s of JP_ESTAT_LABOR_SERIES) {
    const inst = await prisma.instrument.findUniqueOrThrow({ where: { code: s.instrumentCode } });
    const result = await fetchEStatIncremental(s.eStat.statsDataId, "1950-01-01", buildJpEStatLaborMetadata(s));
    console.log(s.instrumentCode, await upsertMacroObservations(prisma, inst.id, result.points, { vintageSource: "jp_estat_labor_backfill" }), result.points[0]?.obsDate.toISOString(), result.points.at(-1)?.obsDate.toISOString());
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Labor sync failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
