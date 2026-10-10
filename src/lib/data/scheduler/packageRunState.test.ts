import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { loadPackageRunStates } from "./packageRunState";
import { releaseConsumed } from "./packageScheduleGuard";

test("failed or unverified package member cannot be masked by healthy headline", async () => {
  const old = new Date("2026-09-05Z"), fresh = new Date("2026-10-06Z");
  const rows = [
    { releasePackageId: "ism", lastSuccessAt: fresh, lastError: null, releaseRule: { type: "economic_calendar", sourceSync: { status: "current", verifiedAt: fresh.toISOString() } } },
    { releasePackageId: "ism", lastSuccessAt: old, lastError: "missing backlog", releaseRule: { type: "economic_calendar" } },
  ];
  const prisma = { dataSubscription: { findMany: async () => rows } } as unknown as PrismaClient;
  const state = (await loadPackageRunStates(prisma)).get("ism")!;
  assert.equal(state.lastSuccessAt?.toISOString(), old.toISOString());
  assert.equal(state.sourceVerifiedAt, null);
  assert.equal(releaseConsumed(state, new Date("2026-10-05Z")), false);
});

test("all-member proof uses earliest verification, not the latest member", async () => {
  const times = ["2026-10-10T10:00:00Z", "2026-10-10T10:05:00Z"];
  const rows = times.map((time) => ({ releasePackageId: "eu", lastSuccessAt: new Date(time), lastError: null,
    releaseRule: { type: "economic_calendar", sourceSync: { status: "current", verifiedAt: time } } }));
  const prisma = { dataSubscription: { findMany: async () => rows } } as unknown as PrismaClient;
  const state = (await loadPackageRunStates(prisma)).get("eu")!;
  assert.equal(state.sourceVerifiedAt?.toISOString(), "2026-10-10T10:00:00.000Z");
});
