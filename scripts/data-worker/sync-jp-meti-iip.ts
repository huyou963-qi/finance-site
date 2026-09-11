import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { JP_METI_IIP_PROVIDER, JP_METI_IIP_SERIES } from "../../src/lib/data/scheduler/jpMetiIip/catalog";
import { fetchJpMetiIipIncremental } from "../../src/lib/data/scheduler/adapters/jpMetiIipAdapter";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  const fixturePath = process.argv.find(a => a.startsWith("--fixture="))?.slice(10);
  for (const s of JP_METI_IIP_SERIES) {
    const inst = await prisma.instrument.findUniqueOrThrow({ where: { code: s.instrumentCode } });
    const result = await fetchJpMetiIipIncremental({ scrape: { provider: JP_METI_IIP_PROVIDER, fixturePath } }, s.instrumentCode, "2018-01-01");
    console.log(s.instrumentCode, await upsertMacroObservations(prisma, inst.id, result.points, { vintageSource: "jp_meti_iip_backfill" }));
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
