import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchMofcomTradeHistory } from "../../src/lib/data/scheduler/mofcomTrade/client";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
loadEnvConfig(process.cwd()); const prisma = new PrismaClient();
async function main() { console.log("[data:sync-mofcom-trade] 正在回填商务部转载的海关货物贸易公开历史…"); const history = await fetchMofcomTradeHistory({ historical: true }); let upserted = 0; for (const series of history.values()) { const item = await prisma.instrument.findUnique({ where: { code: series.code }, select: { id: true } }); if (!item) throw new Error(`未找到 ${series.code}，请先运行 data:seed-mofcom-trade`); upserted += (await upsertMacroObservations(prisma, item.id, series.points)).upserted; } console.log(`[data:sync-mofcom-trade] 完成：序列=${history.size}，新增或修订=${upserted}`); }
main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());
