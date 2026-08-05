/** 官方国家数据全历史回填；总项环比取最新国家统计局月度发布稿。 */
import { loadEnvConfig } from "@next/env"; import { PrismaClient } from "@prisma/client";
import { fetchLatestIndustrialMom, fetchNbsIndustrialHistory } from "../../src/lib/data/scheduler/nbsIndustrial/client";
import { NBS_INDUSTRIAL_CODES, nbsIndustrialCode } from "../../src/lib/data/scheduler/nbsIndustrial/catalog";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
loadEnvConfig(process.cwd()); const prisma = new PrismaClient();
async function main() { const history = await fetchNbsIndustrialHistory(); const mom = await fetchLatestIndustrialMom(); history.set(nbsIndustrialCode("headline", "mom"), [mom.point]); let upserted = 0; for (const code of NBS_INDUSTRIAL_CODES) { const instrument = await prisma.instrument.findUnique({ where: { code }, select: { id: true } }); if (!instrument) throw new Error(`未找到 ${code}，请先 seed`); const result = await upsertMacroObservations(prisma, instrument.id, history.get(code) ?? []); upserted += result.upserted; console.log(`  ${code} points=${(history.get(code) ?? []).length} upserted=${result.upserted}`); } console.log(`[data:sync-nbs-industrial] 完成：upserted=${upserted}，总项环比来源=${mom.articleUrl}`); }
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
