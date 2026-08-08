import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchSafeExternalHistory } from "../../src/lib/data/scheduler/safeExternal/client";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
loadEnvConfig(process.cwd()); const prisma = new PrismaClient();
async function main() { console.log("[data:sync-safe-external] 正在获取外管局公开时间序列表…"); const history = await fetchSafeExternalHistory(); let upserted = 0; for (const series of history.values()) { const item = await prisma.instrument.findUnique({ where: { code: series.code }, select: { id: true } }); if (!item) throw new Error(`未找到 ${series.code}，请先运行 data:seed-safe-external`); upserted += (await upsertMacroObservations(prisma, item.id, series.points)).upserted; } console.log(`[data:sync-safe-external] 完成：序列=${history.size}，upserted=${upserted}`); }
main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());
