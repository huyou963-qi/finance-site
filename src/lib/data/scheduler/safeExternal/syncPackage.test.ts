import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { runDataSubscription, type SubscriptionWithRelations } from "../runSubscription";
import type { SubscriptionRunResult } from "../types";
import { syncSafePackage } from "./syncPackage";
import { fetchSafeExternalHistory } from "./client";

function member(code: string): SubscriptionWithRelations {
  return { sourceId: "safe-external", releasePackageId: "cn.safe.bop-quarterly",
    instrument: { code, metadata: { scrape: { provider: "safe_external", dataset: "bop" } } },
  } as unknown as SubscriptionWithRelations;
}
function database() {
  const schedules: Date[] = [];
  const nextRunAt = new Date("2026-10-11T00:00:00Z");
  const prisma = { dataSubscription: {
    findFirst: async () => ({ nextRunAt }), updateMany: async () => ({}),
  }, releasePackage: {
    findUnique: async () => ({ nextRunAt: new Date("2026-10-09") }),
    update: async ({ data }: { data: { nextRunAt: Date } }) => { schedules.push(data.nextRunAt); return {}; },
  }, $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  scheduleAuditEvent: { create: async () => ({}) },
  } as unknown as PrismaClient;
  return { prisma, schedules };
}
const unchanged: SubscriptionRunResult = { status: "skipped", rowsUpserted: 0, rowsSkipped: 0 };

test("SAFE shares one dataset snapshot, filters revision window, and finalizes after every member", async () => {
  const { prisma, schedules } = database();
  let loads = 0;
  const subs = [member("a"), member("b")];
  const loadHistory = (async () => {
    loads++;
    return new Map(subs.map((sub) => [sub.instrument.code, { points: [
      { obsDate: new Date("2025-01-01"), value: 1 },
      { obsDate: new Date("2026-09-01"), value: 2 },
    ] }]));
  }) as typeof fetchSafeExternalHistory;
  await syncSafePackage(prisma, subs, { loadHistory, runMember: async (_p, _sub, options) => {
    assert.equal(options?.deferPackageSchedule, true);
    assert.equal(schedules.length, 0);
    const fetched = await options!.fetchIncremental!("2026-06-01");
    assert.equal(fetched.points.length, 1);
    assert.equal(fetched.sourceLatestObsDate?.toISOString().slice(0, 10), "2026-09-01");
    return unchanged;
  } });
  assert.equal(loads, 1);
  assert.equal(schedules.length, 1);
});

test("SAFE missing member is an error, never a successful empty fetch", async () => {
  const { prisma } = database();
  await syncSafePackage(prisma, [member("missing")], {
    loadHistory: (async () => new Map()) as typeof fetchSafeExternalHistory,
    runMember: async (_p, _sub, options) => {
      await assert.rejects(options!.fetchIncremental!("2026-06-01"), /缺少成员/);
      return { ...unchanged, status: "failed", error: "missing" };
    },
  });
});

test("SAFE source failure is shared across members, without repeated downloads", async () => {
  const { prisma } = database();
  let loads = 0;
  const results = await syncSafePackage(prisma, [member("a"), member("b")], {
    loadHistory: async () => { loads++; throw new Error("source unavailable"); },
    runMember: async (_p, _sub, options) => {
      await assert.rejects(options!.fetchIncremental!("2026-06-01"), /source unavailable/);
      return { ...unchanged, status: "failed", error: "source unavailable" };
    },
  });
  assert.equal(loads, 1);
  assert.equal(results.filter(({ result }) => result.status === "failed").length, 2);
});

test("interrupted member processing never advances package schedule", async () => {
  const { prisma, schedules } = database();
  await assert.rejects(syncSafePackage(prisma, [member("a"), member("b")], {
    runMember: async () => { throw new Error("database disconnected"); },
  }), /database disconnected/);
  assert.equal(schedules.length, 0);
});

test("a later package member preserves the database schedule advanced by its leader", async () => {
  const currentNext = new Date(Date.now() + 86_400_000);
  const writes: Array<{ nextRunAt: Date }> = [];
  const prisma = {
    $queryRaw: async () => [{ exists: false }],
    fetchRun: { create: async () => ({ id: "run" }), update: async () => ({}) },
    macroObservation: { findFirst: async () => ({ obsDate: new Date("2026-09-01") }) },
    dataSubscription: {
      findUnique: async () => ({ nextRunAt: currentNext }),
      update: async ({ data }: { data: { nextRunAt: Date } }) => { writes.push(data); return {}; },
    },
    scheduleAuditEvent: { create: async () => ({}) },
  } as unknown as PrismaClient;
  const sub = { ...member("a"), id: "a", enabled: true,
    nextRunAt: new Date("2020-01-01"), revisionLookback: 3,
    lastObsDate: new Date("2026-09-01"), source: { adapterKind: "REST_API" },
    releaseRule: { type: "probe_interval", intervalHours: 24 },
  } as unknown as SubscriptionWithRelations;
  const result = await runDataSubscription(prisma, sub, {
    force: true, preserveNextRunAt: true,
    fetchIncremental: async () => ({ points: [], skippedInvalid: 0, sourceLatestObsDate: null }),
  });
  assert.equal(result.status, "skipped");
  assert.equal(writes.length, 1);
  assert.equal(Object.hasOwn(writes[0], "nextRunAt"), false);
});
