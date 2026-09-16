/**
 * 下线国家统计局 70 城房价已停止发布的「定基指数（2020年=100）」。
 *
 * 该口径只出现于过渡期表格，现行月报已不发布；保留订阅会令整个发布包反复失败。
 *
 * npm run data:drop-nbs-realestate-base-index -- --dry-run
 * npm run data:drop-nbs-realestate-base-index -- --apply
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");
  const targets = await prisma.instrument.findMany({
    where: {
      code: { startsWith: "nbs_cn_realestate_" },
      metadata: { path: ["scrape", "key"], string_contains: "|base_index" },
    },
    select: { id: true, code: true, shortName: true },
  });
  const ids = targets.map((item) => item.id);
  const observations = await prisma.macroObservation.count({ where: { instrumentId: { in: ids } } });
  console.log(`[drop-nbs-realestate-base-index] 命中 ${targets.length} 条已停发定基指数，观测=${observations}`);
  for (const item of targets.slice(0, 3)) console.log(`  ${item.code} ${item.shortName}`);
  if (!apply) return void console.log("[drop-nbs-realestate-base-index] --dry-run：未删除；确认后加 --apply");
  const deleted = await prisma.instrument.deleteMany({ where: { id: { in: ids } } });
  console.log(`[drop-nbs-realestate-base-index] 已删除仪器=${deleted.count}（关联订阅、发布包成员与观测由外键级联清理）`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
