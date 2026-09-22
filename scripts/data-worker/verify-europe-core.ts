import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchEcbIncremental } from "../../src/lib/data/scheduler/adapters/ecbAdapter";
import { fetchEurostatIncremental } from "../../src/lib/data/scheduler/adapters/eurostatAdapter";
import { EUROPE_CORE_SERIES } from "../../src/lib/data/scheduler/europeCore/catalog";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  assert.equal(new Set(EUROPE_CORE_SERIES.map((series) => series.instrumentCode)).size, EUROPE_CORE_SERIES.length);
  assert.ok(EUROPE_CORE_SERIES.every((series) => !/(yoy|qoq|mom|ratio)/i.test(series.instrumentCode)), "不得入库二次指标");

  if (process.argv.includes("--live")) {
    const eurostat = EUROPE_CORE_SERIES.find((series) => series.provider === "eurostat")!;
    const ecb = EUROPE_CORE_SERIES.find((series) => series.provider === "ecb")!;
    assert.ok((await fetchEurostatIncremental(eurostat.instrumentCode, "2020-01-01")).points.length > 10);
    assert.ok((await fetchEcbIncremental(ecb.instrumentCode, "2020-01-01")).points.length > 100);
  }

  if (!process.argv.includes("--db")) {
    console.log(`europe-core verify PASS (${EUROPE_CORE_SERIES.length} series, catalog only)`);
    return;
  }

  for (const row of EUROPE_CORE_SERIES) {
    const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: row.instrumentCode } });
    assert.equal(instrument.freqLabel, row.freqLabel);
    assert.equal(instrument.unit, row.unit);
    assert.equal(readFetchAcquisition(instrument.metadata)?.status, "known");
    const subscription = await prisma.dataSubscription.findUniqueOrThrow({ where: { instrumentId: instrument.id } });
    assert.equal(subscription.sourceId, row.sourceId);
    assert.equal(subscription.sourceSeriesKey, row.sourceSeriesKey);
    assert.equal(subscription.enabled, true);
    assert.equal(subscription.fetchMethod, "API");
    assert.equal(subscription.releasePackageId, row.packageId);
    assert.ok(subscription.nextRunAt);
    const member = await prisma.releasePackageMember.findUniqueOrThrow({ where: { instrumentId: instrument.id } });
    assert.equal(member.packageId, row.packageId);
    const lastRun = await prisma.fetchRun.findFirst({ where: { subscriptionId: subscription.id }, orderBy: { startedAt: "desc" } });
    assert.ok(lastRun && ["SUCCESS", "SKIPPED"].includes(lastRun.status), `Worker fetch not successful: ${row.instrumentCode}`);
    assert.ok(await prisma.fetchRun.count({ where: { subscriptionId: subscription.id, status: "SUCCESS" } }), `Missing successful initial capture: ${row.instrumentCode}`);
    const observations = await prisma.macroObservation.aggregate({
      where: { instrumentId: instrument.id },
      _count: true,
      _min: { obsDate: true },
      _max: { obsDate: true },
    });
    assert.ok(observations._count >= row.minObservations, `Too few observations: ${row.instrumentCode}`);
    assert.ok(observations._max.obsDate);
    const lagDays = (Date.now() - observations._max.obsDate!.getTime()) / 86_400_000;
    assert.ok(lagDays <= row.maxLagDays, `Stale ${row.instrumentCode}: ${Math.round(lagDays)} days`);
    console.log(JSON.stringify({
      code: row.instrumentCode,
      count: observations._count,
      first: observations._min.obsDate,
      last: observations._max.obsDate,
      unit: instrument.unit,
      frequency: instrument.freqLabel,
      releasePackage: subscription.releasePackageId,
    }));
  }
  console.log(`europe-core verify PASS (${EUROPE_CORE_SERIES.length} series)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
