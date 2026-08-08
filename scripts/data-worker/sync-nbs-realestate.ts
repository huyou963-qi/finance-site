import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchNbsRealEstateHistory } from "../../src/lib/data/scheduler/nbsRealEstate/client";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  console.log("[data:sync-nbs-realestate] 正在回填国家统计局房地产公开发布归档…");
  const history = await fetchNbsRealEstateHistory({ historical: true });
  let upserted = 0;
  for (const series of history.values()) {
    const item = await prisma.instrument.findUnique({ where: { code: series.code }, select: { id: true } });
    if (!item) throw new Error(`未找到 ${series.code}，请先运行 npm run data:seed-nbs-realestate`);
    upserted += (await upsertMacroObservations(prisma, item.id, series.points)).upserted;
  }
  console.log(`[data:sync-nbs-realestate] 完成：序列=${history.size}，新增或修订=${upserted}`);
}
main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());
