import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { censusFailureDomain, sharedCensusFailure, syncCensusPackage } from "./syncPackage";
import type { SubscriptionWithRelations, runDataSubscription } from "../runSubscription";

function fixture(codes: string[]) {
  const past = new Date("2026-10-20T09:00Z"), future = new Date("2026-11-04T13:33Z");
  const subs = codes.map((c, i) => ({ id: String(i), retryCount: 0, nextRunAt: past,
    releasePackageId: "us.census.international_trade", sourceSeriesKey: c, instrument: { code: c },
  })) as SubscriptionWithRelations[];
  const dates = new Map(subs.map(s => [s.id, past]));
  const logs: Array<{ data: { error?: string; metadata?: { acquisitionDomain?: string } } }> = [];
  const p = { dataSubscription: {
    update: async (q: { where: { id: string }; data: { nextRunAt: Date } }) => { dates.set(q.where.id, q.data.nextRunAt); },
    findMany: async () => subs.map(s => ({ sourceSeriesKey: s.sourceSeriesKey, nextRunAt: dates.get(s.id)!,
      source: { adapterKind: "BULK_FILE" }, instrument: { metadata: { fetchAcquisition: { status: "known" } } } }))
      .sort((a,b) => a.nextRunAt.getTime()-b.nextRunAt.getTime()),
  }, fetchRun: { create: async (q: typeof logs[number]) => { logs.push(q); } },
  releasePackage: { findUnique: async () => ({ nextRunAt: past }), update: async () => ({}) },
  $transaction: async (qs: Promise<unknown>[]) => Promise.all(qs),
  scheduleAuditEvent: { create: async () => ({}) } } as unknown as PrismaClient;
  return { p, subs, dates, logs, future };
}

test("HTTP403 file failure cannot abort independent partner APIs or other End-Use files", async () => {
  const f = fixture(["census_us_trade_exports_enduse_10001", "census_us_trade_exports_enduse_10002",
    "census_us_trade_imports_enduse_10001", "census_us_trade_exports_country_nsa_5700",
    "census_us_trade_imports_country_nsa_5700", "sched_fred_BOPGSTB"]);
  const called: string[] = [];
  const result = await syncCensusPackage(f.p, f.subs, { hasApiKey: true,
    runMember: (async (_p, s, options) => {
      assert.equal(options?.deferPackageSchedule, true);
      assert.equal(options?.preserveNextRunAt, undefined);
      called.push(s.id);
      f.dates.set(s.id, s.id === "0" ? new Date(Date.now()+7200000) : f.future);
      return s.id === "0" ? { status: "failed", error: "Census live source unavailable; HTTP403", rowsUpserted: 0, rowsSkipped: 0 }
        : { status: "skipped", rowsUpserted: 0, rowsSkipped: 10 };
    }) as typeof runDataSubscription });
  assert.deepEqual(called, ["0","2","3","4","5"]);
  assert.equal(result.length, 6);
  assert.equal(result[1].result.error, "acquisition_aborted_after_request_failure: census_us_trade_exports_enduse_10001");
  assert.ok(f.dates.get("1")! > new Date());
  assert.equal(f.dates.get("3"), f.future); // no package-wide failure fan-out
  assert.equal(f.dates.get("5"), f.future); // same release, independent FRED source
  assert.equal(f.logs[0].data.metadata?.acquisitionDomain, "file:exports");
});

test("missing one API country does not suppress other countries in the same request table", async () => {
  const f = fixture(["census_us_trade_exports_country_nsa_5080", "census_us_trade_exports_country_nsa_5081"]);
  const called: string[] = [];
  await syncCensusPackage(f.p, f.subs, { hasApiKey: true,
    runMember: (async (_p, s) => { called.push(s.id); f.dates.set(s.id, f.future);
      return { status: "failed", error: "Census API returned no partner observations", rowsUpserted: 0, rowsSkipped: 0 };
    }) as typeof runDataSubscription });
  assert.deepEqual(called, ["0","1"]);
  assert.equal(sharedCensusFailure("Census partner API network request failed after 2 attempts"), true);
  assert.notEqual(censusFailureDomain(f.subs[0].instrument.code, true), censusFailureDomain("census_us_trade_imports_country_nsa_5081", true));
});
