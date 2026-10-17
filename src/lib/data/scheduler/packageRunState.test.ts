import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { loadPackageRunStates } from "./packageRunState";
import { releaseConsumed } from "./packageScheduleGuard";

test("NBS late monthly detail cannot be consumed by a successful headline or annual member", async () => {
  for (const packageId of ["cn.nbs.ppi", "cn.nbs.industrial-production", "cn.nbs.retail-sales"]) {
    const at = new Date("2026-10-15T03:00:00Z");
    const rows = ["2026-09-01", "2026-08-01", "2025-01-01"].map((date, i) => ({
      releasePackageId: packageId, granularity: i === 2 ? "ANNUAL" : "MONTHLY",
      instrument: { code: `member-${i}`, metadata: { fetchAcquisition: { status: "known" } } },
      source: { adapterKind: "REST_API" }, sourceSeriesKey: `member-${i}`,
      lastSuccessAt: at, lastObsDate: new Date(date), lastError: null,
      releaseRule: { type: "economic_calendar", sourceSync: { status: "current", verifiedAt: at.toISOString() } },
    }));
    if (packageId === "cn.nbs.industrial-production") rows.push({ ...rows[0]!,
      instrument: { ...rows[0]!.instrument, code: "nbs_cn_industrial_collective_yoy" },
      lastObsDate: new Date("2018-12-01"),
    });
    const prisma = { $queryRaw: async () => [], dataSubscription: { findMany: async () => rows } } as unknown as PrismaClient;
    const release = new Date("2026-10-14T01:30:00Z");
    assert.equal(releaseConsumed((await loadPackageRunStates(prisma)).get(packageId)!, release), false);
    rows[1]!.lastObsDate = new Date("2026-09-01");
    assert.equal(releaseConsumed((await loadPackageRunStates(prisma)).get(packageId)!, release), true);
  }
});

test("CPI observation proof uses the oldest eligible member even after successful empty checks", async () => {
  const at = new Date("2026-10-14T12:41:00Z");
  const rows = ["2026-09-01", "2026-08-01"].map((month, i) => ({
    instrument: { code: `cpi-${i}`, metadata: { fetchAcquisition: { status: "known" } } },
    source: { adapterKind: "FRED_API" }, sourceSeriesKey: `cpi-${i}`, releasePackageId: "us.bls.cpi",
    lastSuccessAt: at, lastObsDate: new Date(month), lastError: null,
    releaseRule: { type: "economic_calendar", sourceSync: { status: "current", verifiedAt: at.toISOString() } },
  }));
  const prisma = { $queryRaw: async () => [], dataSubscription: { findMany: async () => rows } } as unknown as PrismaClient;
  assert.equal(releaseConsumed((await loadPackageRunStates(prisma)).get("us.bls.cpi")!, new Date("2026-10-14T12:30:00Z")), false);
  rows[1]!.lastObsDate = new Date("2026-09-01");
  assert.equal(releaseConsumed((await loadPackageRunStates(prisma)).get("us.bls.cpi")!, new Date("2026-10-14T12:30:00Z")), true);
});

const schedulable = <T extends { instrument: { code: string } }>(rows: T[]) => rows.map((row) => ({
  ...row, source: { adapterKind: "FRED_API" },
  instrument: { ...row.instrument, metadata: { fetchAcquisition: { status: "known" } } },
}));

test("failed or unverified package member cannot be masked by healthy headline", async () => {
  const old = new Date("2026-09-05Z"), fresh = new Date("2026-10-06Z");
  const rows = [
    { instrument:{code:"headline"},sourceSeriesKey:"headline",releasePackageId: "ism", lastSuccessAt: fresh, lastError: null, releaseRule: { type: "economic_calendar", sourceSync: { status: "current", verifiedAt: fresh.toISOString() } } },
    { instrument:{code:"backlog"},sourceSeriesKey:"backlog",releasePackageId: "ism", lastSuccessAt: old, lastError: "missing backlog", releaseRule: { type: "economic_calendar" } },
  ];
  const prisma = { $queryRaw:async()=>[],dataSubscription: { findMany: async () => schedulable(rows) } } as unknown as PrismaClient;
  const state = (await loadPackageRunStates(prisma)).get("ism")!;
  assert.equal(state.lastSuccessAt?.toISOString(), old.toISOString());
  assert.equal(state.sourceVerifiedAt, null);
  assert.equal(releaseConsumed(state, new Date("2026-10-05Z")), false);
});

test("all-member proof uses earliest verification, not the latest member", async () => {
  const times = ["2026-10-10T10:00:00Z", "2026-10-10T10:05:00Z"];
  const rows = times.map((time) => ({ instrument:{code:time},sourceSeriesKey:time,releasePackageId: "eu", lastSuccessAt: new Date(time), lastError: null,
    releaseRule: { type: "economic_calendar", sourceSync: { status: "current", verifiedAt: time } } }));
  const prisma = { $queryRaw:async()=>[],dataSubscription: { findMany: async () => schedulable(rows) } } as unknown as PrismaClient;
  const state = (await loadPackageRunStates(prisma)).get("eu")!;
  assert.equal(state.sourceVerifiedAt?.toISOString(), "2026-10-10T10:00:00.000Z");
});

test("deleted member does not permanently block consumption of a healthy package",async()=>{
  const fresh=new Date("2026-10-10Z");
  const rows=[{instrument:{code:"alive"},sourceSeriesKey:"alive",releasePackageId:"pkg",lastSuccessAt:fresh,lastError:null,releaseRule:{type:"economic_calendar",sourceSync:{status:"current",verifiedAt:fresh.toISOString()}}},
    {instrument:{code:"deleted"},sourceSeriesKey:"deleted",releasePackageId:"pkg",lastSuccessAt:null,lastError:"old failure",releaseRule:{type:"economic_calendar"}}];
  const prisma={$queryRaw:async()=>[{catalog_key:"mds:deleted"}],dataSubscription:{findMany:async()=>schedulable(rows)}} as unknown as PrismaClient;
  const state=(await loadPackageRunStates(prisma)).get("pkg")!;
  assert.equal(state.hasUnresolvedFailures,false);
  assert.equal(releaseConsumed(state,new Date("2026-10-05Z")),true);
});

test("unschedulable archived member cannot cause permanent package rechecks", async () => {
  const fresh = new Date("2026-10-13T03:00:00Z");
  const rows = schedulable([
    { instrument: { code: "current" }, sourceSeriesKey: "IEAA", releasePackageId: "bea", lastSuccessAt: fresh, lastError: null,
      releaseRule: { type: "economic_calendar", sourceSync: { status: "current", verifiedAt: fresh.toISOString() } } },
    { instrument: { code: "archive" }, sourceSeriesKey: "IEASAD", releasePackageId: "bea", lastSuccessAt: null, lastError: null,
      releaseRule: { type: "economic_calendar" } },
  ]);
  rows[1].instrument.metadata.fetchAcquisition.status = "pending";
  const prisma = { $queryRaw: async () => [], dataSubscription: { findMany: async () => rows } } as unknown as PrismaClient;
  const state = (await loadPackageRunStates(prisma)).get("bea")!;
  assert.equal(state.lastSuccessAt?.toISOString(), fresh.toISOString());
  assert.equal(releaseConsumed(state, new Date("2026-09-24T12:30:00Z")), true);
  // Acquisition recovery makes that member runnable again; it must then
  // obtain its own proof before the whole package can be consumed.
  rows[1].instrument.metadata.fetchAcquisition.status = "known";
  const restored = (await loadPackageRunStates(prisma)).get("bea")!;
  assert.equal(restored.lastSuccessAt, null);
  assert.equal(releaseConsumed(restored, new Date("2026-09-24T12:30:00Z")), false);
});

test("pending acquisition never hides an existing FAILED member", async () => {
  const fresh = new Date("2026-10-13T03:00:00Z");
  const rows = schedulable([
    { instrument: { code: "headline" }, sourceSeriesKey: "head", releasePackageId: "pkg", lastSuccessAt: fresh, lastError: null as string | null,
      releaseRule: { type: "economic_calendar", sourceSync: { status: "current", verifiedAt: fresh.toISOString() } } },
    { instrument: { code: "failed" }, sourceSeriesKey: "failed", releasePackageId: "pkg", lastSuccessAt: null, lastError: "HTTP 503",
      releaseRule: { type: "economic_calendar" } },
  ]);
  rows[1].instrument.metadata.fetchAcquisition.status = "pending";
  const prisma = { $queryRaw: async () => [], dataSubscription: { findMany: async () => rows } } as unknown as PrismaClient;
  const state = (await loadPackageRunStates(prisma)).get("pkg")!;
  assert.equal(state.hasUnresolvedFailures, true);
  assert.equal(releaseConsumed(state, new Date("2026-09-24T12:30:00Z")), false);
});
