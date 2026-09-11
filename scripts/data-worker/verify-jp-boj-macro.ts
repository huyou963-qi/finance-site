import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { BOJ_SERIES, BOJ_SOURCE_ID } from "../../src/lib/data/scheduler/boj/catalog";
import { fetchBojSeries } from "../../src/lib/data/scheduler/boj/client";
import { parseBojResponse } from "../../src/lib/data/scheduler/boj/parser";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  assert.equal(new Set(BOJ_SERIES.map((r) => r.instrumentCode)).size, BOJ_SERIES.length);
  for (const row of BOJ_SERIES) {
    if (process.argv.includes("--live")) assert.ok(parseBojResponse(await fetchBojSeries(row), row).points.length >= 50);
    if (!process.argv.includes("--db")) continue;
    const inst = await prisma.instrument.findUniqueOrThrow({ where: { code: row.instrumentCode } });
    assert.equal(inst.unit, row.unit); assert.equal(inst.freqLabel, row.freqLabel);
    assert.equal(readFetchAcquisition(inst.metadata)?.status, "known");
    const sub = await prisma.dataSubscription.findUniqueOrThrow({ where: { instrumentId: inst.id } });
    assert.equal(sub.sourceId, BOJ_SOURCE_ID); assert.equal(sub.enabled, true); assert.equal(sub.releasePackageId, row.releasePackageId);
    assert.ok(sub.nextRunAt); assert.equal(sub.fetchMethod, "API");
    assert.deepEqual(sub.releaseRule, { type: "probe_interval", intervalHours: row.frequency === "QUARTERLY" ? 168 : 72 });
    const member = await prisma.releasePackageMember.findUniqueOrThrow({ where: { instrumentId: inst.id } });
    assert.equal(member.packageId, row.releasePackageId);
    const lastRun = await prisma.fetchRun.findFirst({ where: { subscriptionId: sub.id }, orderBy: { startedAt: "desc" } });
    assert.ok(lastRun && ["SUCCESS", "SKIPPED"].includes(lastRun.status), `Worker fetch not successful: ${row.instrumentCode}`);
    assert.ok(await prisma.fetchRun.count({ where: { subscriptionId: sub.id, status: "SUCCESS" } }), `Missing successful initial capture: ${row.instrumentCode}`);
    const observations = await prisma.macroObservation.aggregate({ where: { instrumentId: inst.id }, _count: true, _min: { obsDate: true }, _max: { obsDate: true } });
    assert.ok(observations._count >= 50);
    const latest = observations._max.obsDate!;
    assert.ok(latest.getTime() <= Date.now());
    assert.ok(Date.now() - latest.getTime() < (row.frequency === "QUARTERLY" ? 240 : 120) * 86400000, `Stale ${row.instrumentCode}`);
    console.log(JSON.stringify({ code: row.instrumentCode, count: observations._count, first: observations._min.obsDate, last: latest, unit: inst.unit, frequency: inst.freqLabel, releasePackage: sub.releasePackageId }));
  }
  console.log(`jp-boj-macro verify PASS (${BOJ_SERIES.length} series)`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
