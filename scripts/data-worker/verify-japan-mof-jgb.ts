import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { JGB_SERIES } from "../../src/lib/data/scheduler/japanMofJgb/catalog";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  assert.equal(new Set(JGB_SERIES.map((s) => s.code)).size, 15);
  if (!process.argv.includes("--db")) return;
  for (const row of JGB_SERIES) {
    const inst = await prisma.instrument.findUniqueOrThrow({ where: { code: row.code }, include: { dataSubscription: true } });
    const sub = inst.dataSubscription;
    assert.equal(inst.unit, "%"); assert.equal(inst.freqLabel, "日");
    assert(sub?.enabled && sub.lastSuccessAt && sub.nextRunAt && !sub.lastError);
    assert.equal(sub.sourceId, "japan-mof-jgb");
    assert.equal(sub.releasePackageId, "jp.mof.jgb_yields");
    const stats = await prisma.macroObservation.aggregate({ where: { instrumentId: inst.id }, _count: true, _min: { obsDate: true }, _max: { obsDate: true } });
    assert(stats._count > 3000);
    assert(Date.now() - stats._max.obsDate!.getTime() < 14 * 86400000);
    console.log(row.code, stats._count, stats._min.obsDate?.toISOString().slice(0, 10), stats._max.obsDate?.toISOString().slice(0, 10));
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
