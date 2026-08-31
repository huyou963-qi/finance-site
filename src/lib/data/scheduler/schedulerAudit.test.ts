import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { recordScheduleChange } from "./schedulerAudit";

test("recordScheduleChange ignores unchanged schedules", async () => {
  let creates = 0;
  const prisma = {
    scheduleAuditEvent: {
      async create() {
        creates += 1;
      },
    },
  } as unknown as PrismaClient;
  const time = new Date("2026-09-01T00:00:00Z");
  await recordScheduleChange(prisma, {
    subscriptionId: "sub-1",
    previousNextRunAt: time,
    nextRunAt: new Date(time),
    source: "test",
    reason: "unchanged",
  });
  assert.equal(creates, 0);
});

test("recordScheduleChange persists old/new time and reason", async () => {
  let data: Record<string, unknown> | undefined;
  const prisma = {
    scheduleAuditEvent: {
      async create(input: { data: Record<string, unknown> }) {
        data = input.data;
      },
    },
  } as unknown as PrismaClient;
  const previous = new Date("2026-08-12T14:10:00Z");
  const next = new Date("2026-09-11T13:30:00Z");
  await recordScheduleChange(prisma, {
    releasePackageId: "us.bls.cpi",
    previousNextRunAt: previous,
    nextRunAt: next,
    source: "calendar_sync",
    reason: "calendar_matched",
  });
  assert.equal(data?.releasePackageId, "us.bls.cpi");
  assert.equal(data?.previousNextRunAt, previous);
  assert.equal(data?.nextRunAt, next);
  assert.equal(data?.reason, "calendar_matched");
});
