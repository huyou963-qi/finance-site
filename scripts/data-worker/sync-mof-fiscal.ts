import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchMofFiscalHistory } from "../../src/lib/data/scheduler/mofFiscal/client";
import { MOF_FISCAL_COMPONENTS, mofFiscalCode, type FiscalMeasure } from "../../src/lib/data/scheduler/mofFiscal/catalog";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
loadEnvConfig(process.cwd()); const prisma = new PrismaClient();
async function main() { console.log("[data:sync-mof-fiscal] 正在获取财政部历史归档…"); const history = await fetchMofFiscalHistory(); console.log("[data:sync-mof-fiscal] 归档获取完成，正在写入数据库…"); let upserted = 0; let unavailable = 0; for (const component of MOF_FISCAL_COMPONENTS) for (const measure of ["amount", "yoy"] as const satisfies readonly FiscalMeasure[]) { const code = mofFiscalCode(component.key, measure); const inst = await prisma.instrument.findUnique({ where: { code }, select: { id: true } }); if (!inst) throw new Error(`未找到 ${code}，请先 seed`); const points = history.get(component.key)?.get(measure) ?? []; if (!points.length) { await prisma.instrument.delete({ where: { id: inst.id } }); unavailable++; continue; } upserted += (await upsertMacroObservations(prisma, inst.id, points)).upserted; } console.log(`[data:sync-mof-fiscal] 完成：upserted=${upserted}，未发布分项=${unavailable}`); }
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
