import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { listDueSubscriptions, runDataSubscription, type SubscriptionWithRelations } from "./runSubscription";
import { calendarToProbeReset } from "./releasePackageSeedPolicy";
import { finalizePackageCalendar } from "./syncReleasePackage";
import { refreshProbePackageNextRunAt } from "./probePackageSchedule";

const calendar = { type: "economic_calendar", fallback: { type: "probe_interval", intervalHours: 24 } };
const probe = { type: "probe_interval", intervalHours: 72 };

test("calendar to probe clears obsolete publication proof and future package timestamp only on transition", () => {
  const reset = calendarToProbeReset(calendar, probe);
  assert.deepEqual(reset, { scheduleState: {}, nextRunAt: null });
  assert.equal(calendarToProbeReset(probe, probe), null);
  assert.equal(calendarToProbeReset(calendar, calendar), null);
  assert.equal(calendarToProbeReset(undefined, probe), null);
});

test("worker limit counts packages and includes all 88 due fiscal members", async () => {
  const members = Array.from({ length: 88 }, (_, i) => ({
    id: `fiscal-${i}`, enabled: true, releasePackageId: "cn.mof.fiscal", sourceId: "mof-fiscal",
    sourceSeriesKey: `fiscal-${i}`, source: { adapterKind: "REST_API" },
    instrument: { code: `fiscal-${i}`, metadata: { fetchAcquisition: { status: "known", probedAt: "2026-10-21T00:00:00Z" } } },
  }));
  const prisma = { dataSubscription: { findMany: async () => members }, $queryRaw: async () => [] } as unknown as PrismaClient;
  const selected = await listDueSubscriptions(prisma, 1);
  assert.equal(selected.length, 88);
});

for (const { sharedCalendar, historicalBootstrap } of [
  { sharedCalendar: false, historicalBootstrap: false },
  { sharedCalendar: true, historicalBootstrap: false },
  { sharedCalendar: false, historicalBootstrap: true },
]) {
  test(`${historicalBootstrap ? "historical bootstrap archives once; " : ""}${sharedCalendar ? "calendar" : "probe"} package ${sharedCalendar ? "shares" : "does not overwrite"} member schedules`, async () => {
    const memberWrites: Array<Record<string, unknown>> = [];
    const fanouts: Array<Record<string, unknown>> = [];
    const packageWrites: Array<Record<string, unknown>> = [];
    const prisma = {
      $queryRaw: async () => [{ exists: false }],
      fetchRun: { create: async () => ({ id: "run" }), update: async () => ({}) },
      macroObservation: {
        findFirst: async () => ({ obsDate: new Date("2026-09-01") }),
        findMany: async () => [{ obsDate: new Date("2026-09-01"), value: 1 }],
      },
      dataSubscription: {
        findFirst: async () => ({ nextRunAt: new Date("2026-01-01") }),
        findUnique: async () => ({ nextRunAt: new Date("2026-01-01") }),
        update: async ({ data }: { data: Record<string, unknown> }) => { memberWrites.push(data); return {}; },
        updateMany: async ({ data }: { data: Record<string, unknown> }) => { fanouts.push(data); return {}; },
      },
      releasePackage: {
        findUnique: async () => ({ nextRunAt: new Date("2026-01-01") }),
        update: async ({ data }: { data: Record<string, unknown> }) => { packageWrites.push(data); return {}; },
      },
      scheduleAuditEvent: { create: async () => ({}) },
    } as unknown as PrismaClient;
    const sub = {
      id: "a", instrumentId: "a", sourceId: historicalBootstrap ? "mof-budget-accounts" : "mof-fiscal", sourceSeriesKey: "a", enabled: true,
      releasePackageId: "cn.mof.test", nextRunAt: new Date("2026-01-01"), retryCount: 0, revisionLookback: 3,
      source: { adapterKind: "REST_API" }, instrument: { id: "a", code: "a", metadata: historicalBootstrap ? { historicalOnly: true, archiveAfterBootstrap: true } : {} },
      releaseRule: probe,
      releasePackage: { id: "cn.mof.test", releaseTemplate: sharedCalendar ? calendar : probe, scheduleState: {} },
    } as unknown as SubscriptionWithRelations;
    const before = Date.now();
    const result = await runDataSubscription(prisma, sub, {
      force: true, skipCalendarRefresh: true,
      fetchIncremental: async () => ({ points: historicalBootstrap ? [{ obsDate: new Date("2026-09-01"), value: 1 }] : [], skippedInvalid: 0, sourceLatestObsDate: null }),
    });
    assert.equal(result.status, "skipped");
    assert.equal(memberWrites.length, 1);
    const next = memberWrites[0].nextRunAt as Date;
    if (historicalBootstrap) {
      assert.equal(next, null);
      assert.equal(memberWrites[0].enabled, false);
    } else {
      assert.ok(next instanceof Date);
      assert.ok(next.getTime() >= before + (sharedCalendar ? 24 : 72) * 3_600_000);
    }
    assert.equal(fanouts.length, sharedCalendar ? 1 : 0);
    assert.equal(packageWrites.length, 1);
  });
}

for (const earliest of [null, new Date("2026-10-22T00:00:00Z")]) {
  test(`probe display aggregate preserves member schedules including uninitialized due time: ${earliest}`, async () => {
    const writes: Array<{ nextRunAt: Date | null }> = [];
    const prisma = {
      dataSubscription: { findFirst: async ({ orderBy }: { orderBy: unknown }) => {
        assert.deepEqual(orderBy, { nextRunAt: { sort: "asc", nulls: "first" } });
        return { nextRunAt: earliest };
      } },
      releasePackage: { update: async ({ data }: { data: { nextRunAt: Date | null } }) => { writes.push(data); return {}; } },
    } as unknown as PrismaClient;
    await refreshProbePackageNextRunAt(prisma, "cn.mof.test");
    const subs = [{ releasePackageId: "cn.mof.test", releasePackage: { releaseTemplate: probe } }] as SubscriptionWithRelations[];
    await finalizePackageCalendar(prisma, subs, [], false);
    assert.equal(writes.length, 2);
    assert.deepEqual(writes, [{ nextRunAt: earliest }, { nextRunAt: earliest }]);
    // This database deliberately has no member updateMany: manual failure must not fan out.
  });
}
