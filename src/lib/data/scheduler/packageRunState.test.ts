import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { loadPackageRunStates } from "./packageRunState";
import { releaseConsumed } from "./packageScheduleGuard";

test("NBS late monthly detail cannot be consumed by a successful headline or annual member", async () => {
  for (const packageId of ["cn.nbs.ppi", "cn.nbs.industrial-production", "cn.nbs.retail-sales", "cn.nbs.fixed-asset-investment"]) {
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
    source: { adapterKind: "FRED_API" }, granularity: "MONTHLY", sourceSeriesKey: `cpi-${i}`, releasePackageId: "us.bls.cpi",
    lastSuccessAt: at, lastObsDate: new Date(month), lastError: null,
    releaseRule: { type: "economic_calendar", sourceSync: { status: "current", verifiedAt: at.toISOString(), sourcePublishedAt: at.toISOString() } },
  }));
  const prisma = { $queryRaw: async () => [], dataSubscription: { findMany: async () => rows } } as unknown as PrismaClient;
  assert.equal(releaseConsumed((await loadPackageRunStates(prisma)).get("us.bls.cpi")!, new Date("2026-10-14T12:30:00Z")), false);
  rows[1]!.lastObsDate = new Date("2026-09-01");
  assert.equal(releaseConsumed((await loadPackageRunStates(prisma)).get("us.bls.cpi")!, new Date("2026-10-14T12:30:00Z")), true);
});

const schedulable = <T extends { instrument: { code: string } }>(rows: T[]) => rows.map((row) => ({
  ...row, source: { adapterKind: "REST_API" },
  instrument: { ...row.instrument, metadata: { fetchAcquisition: { status: "known" } } },
}));

test("FRED PPI/all registered monthly reports require publication proof AND every member's target period", async () => {
  const { MONTHLY_RELEASE_LAG } = await import("./releaseObservationPolicy");
  const release = new Date("2026-10-15T12:30:00Z");
  const at = new Date("2026-10-19T15:00:00Z");
  for (const [packageId, lag] of Object.entries(MONTHLY_RELEASE_LAG).filter(([id]) => id.startsWith("us."))) {
    const target = new Date(Date.UTC(2026, 9 - lag, 1));
    const rows = [0, 1].map((i) => ({ releasePackageId: packageId, granularity: "MONTHLY",
      source: { adapterKind: "FRED_API" }, sourceSeriesKey: `series-${i}`,
      instrument: { code: `series-${i}`, metadata: { fetchAcquisition: { status: "known" } } },
      lastObsDate: i ? new Date(Date.UTC(2026, 8 - lag, 1)) : target,
      lastSuccessAt: at, lastError: null,
      releaseRule: { type: "economic_calendar", sourceSync: { status: "current", verifiedAt: at.toISOString(), sourcePublishedAt: at.toISOString() } },
    }));
    const prisma = { $queryRaw: async () => [], dataSubscription: { findMany: async () => rows } } as unknown as PrismaClient;
    const consumed = async () => releaseConsumed((await loadPackageRunStates(prisma)).get(packageId)!, release);
    assert.equal(await consumed(), false, `${packageId}: revised old month cannot consume`);
    rows[1].lastObsDate = target;
    assert.equal(await consumed(), true, `${packageId}: all target months published`);
    rows[1].releaseRule.sourceSync.sourcePublishedAt = "2026-10-14T10:00:00Z";
    assert.equal(await consumed(), false, `${packageId}: run time cannot replace publication time`);
  }
});

test("FRED revision-only and weekly reports never fall back to ran-once legacy equality", async () => {
  const at = new Date("2026-10-19T15:00:00Z");
  const rows = [{ releasePackageId: "us.bea.gdp", granularity: "QUARTERLY", source: { adapterKind: "FRED_API" },
    sourceSeriesKey: "GDP", instrument: { code: "GDP", metadata: { fetchAcquisition: { status: "known" } } },
    lastSuccessAt: at, lastObsDate: new Date("2026-07-01"), lastError: null,
    releaseRule: { type: "economic_calendar", sourceSync: { status: "current", verifiedAt: at.toISOString(), sourcePublishedAt: "" } } }];
  const prisma = { $queryRaw: async () => [], dataSubscription: { findMany: async () => rows } } as unknown as PrismaClient;
  const state = async () => (await loadPackageRunStates(prisma)).get("us.bea.gdp")!;
  assert.equal((await state()).requiredMonthlyObservation, undefined);
  assert.equal(releaseConsumed(await state(), new Date("2026-10-15T12:30:00Z")), false);
  // Same quarter and even identical values are legitimate for a GDP revision,
  // provided FRED itself published the series after the release.
  rows[0].releaseRule.sourceSync.sourcePublishedAt = at.toISOString();
  assert.equal(releaseConsumed(await state(), new Date("2026-10-15T12:30:00Z")), true);
});

test("mixed-release state preserves every dependency identity and rejects missing member proof", async () => {
  const at = new Date("2026-10-20T22:00:00Z");
  const rows = [18, 101].map((releaseId) => ({ releasePackageId: "us.fed.fomc", granularity: "DAILY",
    source: { adapterKind: "FRED_API" }, sourceSeriesKey: `series-${releaseId}`,
    instrument: { code: `series-${releaseId}`, metadata: { fetchAcquisition: { status: "known" } } },
    lastObsDate: new Date("2026-10-19"), lastSuccessAt: at, lastError: null,
    releaseRule: { type: "economic_calendar", sourceSync: { status: "current", verifiedAt: at.toISOString(),
      sourcePublishedAt: at.toISOString(), sourcePublications: [{ releaseId, publishedAt: at.toISOString() }] } },
  }));
  const prisma = { $queryRaw: async () => [], dataSubscription: { findMany: async () => rows } } as unknown as PrismaClient;
  const state = async () => ({ ...(await loadPackageRunStates(prisma)).get("us.fed.fomc")!,
    previousReleaseById: { 18: new Date("2026-10-20T12:30:00Z"), 101: new Date("2026-09-16T12:30:00Z") } });
  assert.equal((await state()).publicationRequirements?.length, 2);
  assert.equal(releaseConsumed(await state(), new Date("2026-10-20T12:30:00Z")), true);
  rows[1].releaseRule.sourceSync.sourcePublications = [];
  assert.equal(releaseConsumed(await state(), new Date("2026-10-20T12:30:00Z")), false);
});

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

test("historical Census member with legacy failure cannot pin current trade release", async () => {
  const time = new Date("2026-10-20T01:00Z");
  const rows = schedulable([
    { instrument: { code: "current" }, sourceSeriesKey: "census_us_trade_exports_country_nsa_7321",
      releasePackageId: "us.census.international_trade", lastSuccessAt: time, lastObsDate: new Date("2026-08-01"),
      granularity: "MONTHLY", lastError: null as string | null,
      releaseRule: { type: "economic_calendar", sourceSync: { status: "current", verifiedAt: time.toISOString() } } },
    { instrument: { code: "historical" }, sourceSeriesKey: "census_us_trade_exports_country_nsa_7320",
      releasePackageId: "us.census.international_trade", lastSuccessAt: time, lastObsDate: new Date("2011-07-01"),
      granularity: "MONTHLY", lastError: "no partner observations",
      releaseRule: { type: "economic_calendar", sourceSync: { status: "current", verifiedAt: time.toISOString() } } },
  ]);
  const prisma = { $queryRaw: async () => [], dataSubscription: { findMany: async () => rows } } as unknown as PrismaClient;
  const state = (await loadPackageRunStates(prisma)).get("us.census.international_trade")!;
  assert.equal(state.hasUnresolvedFailures, false);
  assert.equal(state.requiredMonthlyObservation?.oldest?.toISOString().slice(0,10), "2026-08-01");
});
