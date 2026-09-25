/**
 * 指标预测版本账本自检：非农须覆盖 2004 年以来每个月，ADP 须覆盖 2022-09 以来。
 *
 * npm run data:verify-forecast-vintages -- --db
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { prisma } from "../../src/lib/prisma";

const CHECKS = [
  { code: "sched_fred_PAYEMS", from: "2004-01-01", maxMissing: 2 },
  { code: "sched_fred_ADPMNUSNERSA", from: "2022-09-01", maxMissing: 1 },
] as const;

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

async function main() {
  if (!process.argv.includes("--db")) {
    console.log("[verify-forecast-vintages] 静态通过（加 --db 检查数据库）");
    return;
  }
  let errors = 0;
  for (const check of CHECKS) {
    const inst = await prisma.instrument.findUnique({ where: { code: check.code }, select: { id: true } });
    if (!inst) {
      console.error(`  ✗ 缺 Instrument ${check.code}`);
      errors++;
      continue;
    }
    const latest = await prisma.macroObservation.findFirst({
      where: { instrumentId: inst.id },
      orderBy: { obsDate: "desc" },
      select: { obsDate: true },
    });
    const rows = await prisma.macroObservationVintage.findMany({
      where: { instrumentId: inst.id, obsDate: { gte: new Date(`${check.from}T00:00:00Z`) } },
      select: { obsDate: true },
      distinct: ["obsDate"],
    });
    const have = new Set(rows.map((r) => r.obsDate.toISOString().slice(0, 10)));
    const want = monthsBetween(check.from, latest?.obsDate.toISOString().slice(0, 10) ?? check.from);
    const missing = want.filter((m) => !have.has(m));
    const total = await prisma.macroObservationVintage.count({ where: { instrumentId: inst.id } });
    if (missing.length > check.maxMissing) {
      console.error(`  ✗ ${check.code} 缺 ${missing.length} 个月的版本（例 ${missing.slice(0, 5).join(",")}）`);
      errors++;
    } else {
      console.log(`  ✓ ${check.code} 版本 ${total} 条，覆盖 ${want.length - missing.length}/${want.length} 个月`);
    }
  }
  if (errors) {
    console.error(`[verify-forecast-vintages] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-forecast-vintages] 通过");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
