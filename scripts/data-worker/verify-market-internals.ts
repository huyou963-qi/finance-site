import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { MARKET_INTERNALS_SERIES } from "../../src/lib/data/scheduler/marketInternals/catalog";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  assert.equal(new Set(MARKET_INTERNALS_SERIES.map((r) => r.code)).size, 13);
  if (!process.argv.includes("--db")) return;
  for (const row of MARKET_INTERNALS_SERIES) {
    const inst = await prisma.instrument.findUniqueOrThrow({ where: { code: row.code }, include: { dataSubscription: true } });
    assert.equal(inst.freqLabel, "日");
    assert.equal(inst.dataSubscription?.granularity, "DAILY");
    assert.equal(inst.dataSubscription?.enabled, true);
    assert.equal(inst.dataSubscription?.revisionLookback, row.source === "french" ? 1000 : 2);
    assert.deepEqual(inst.dataSubscription?.releaseRule, { type: "probe_interval", intervalHours: row.source === "french" ? 24 : 6 });
    assert.equal(inst.dataSubscription?.releasePackageId, row.source === "french" ? "us.french.daily_style_factors" : row.source === "breadth" ? "us.gekkotech.daily_market_breadth" : "us.gekkotech.daily_style_proxies");
    assert.ok(inst.dataSubscription?.nextRunAt, `${row.code}缺少自动排期`);
    const stats = await prisma.macroObservation.aggregate({ where: { instrumentId: inst.id }, _count: true, _min: { obsDate: true, value: true }, _max: { obsDate: true, value: true } });
    assert.ok(stats._count > 0, `${row.code}缺少历史观测`);
    if (row.source === "french") {
      assert.ok(stats._count > 7000);
      assert.ok(stats._min.obsDate!.toISOString().slice(0, 10) <= "1995-01-04");
    } else if (row.source === "breadth") {
      assert.ok(stats._min.value! >= 0 && stats._max.value! <= 100);
    }
    console.log(row.code, stats._count, stats._min.obsDate?.toISOString().slice(0, 10), stats._max.obsDate?.toISOString().slice(0, 10));
    if (process.argv.includes("--history") && row.source === "breadth" && row.key.startsWith("above")) {
      const years = await prisma.$queryRaw<{ year: number; points: bigint; first: Date; last: Date }[]>`SELECT EXTRACT(YEAR FROM obs_date)::int AS year,COUNT(*) AS points,MIN(obs_date) AS first,MAX(obs_date) AS last FROM mds."MacroObservation" WHERE instrument_id=${inst.id}::uuid GROUP BY 1 ORDER BY 1`;
      console.log(years.map((r) => ({ year: r.year, points: Number(r.points), first: r.first.toISOString().slice(0, 10), last: r.last.toISOString().slice(0, 10) })));
    }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
