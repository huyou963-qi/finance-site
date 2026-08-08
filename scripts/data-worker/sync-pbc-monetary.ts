import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchPbcMonetaryHistory } from "../../src/lib/data/scheduler/pbcMonetary/client";
import { PBC_MONETARY_COMPONENTS, pbcMonetaryCode } from "../../src/lib/data/scheduler/pbcMonetary/catalog";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
loadEnvConfig(process.cwd()); const prisma = new PrismaClient();
async function main() { console.log("[data:sync-pbc-monetary] 正在低频获取人民银行公开历史归档…"); const history = await fetchPbcMonetaryHistory(); let upserted = 0; let unavailable = 0; for (const component of PBC_MONETARY_COMPONENTS) { const code = pbcMonetaryCode(component.key); const instrument = await prisma.instrument.findUnique({ where: { code }, select: { id: true } }); if (!instrument) throw new Error(`未找到 ${code}，请先运行 data:seed-pbc-monetary`); const points = history.get(component.key) ?? []; if (!points.length) { unavailable++; console.warn(`[data:sync-pbc-monetary] 官方归档尚无 ${code}`); continue; } upserted += (await upsertMacroObservations(prisma, instrument.id, points)).upserted; } console.log(`[data:sync-pbc-monetary] 完成：upserted=${upserted}，暂无公告分项=${unavailable}`); }
main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());
