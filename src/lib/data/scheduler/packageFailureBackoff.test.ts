import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { backoffFailedPackage } from "./packageFailureBackoff";
import type { SubscriptionWithRelations } from "./runSubscription";

test("a failed later member cannot fan a preserved past nextRunAt over the package", async () => {
  for (const retryCount of [0, 3, 113]) {
    const writes: Array<{ nextRunAt?: Date }> = [];
    const p = { dataSubscription: {
      update: async (q: { data: { nextRunAt: Date } }) => { writes.push(q.data); },
      updateMany: async (q: { data: { nextRunAt: Date } }) => { writes.push(q.data); },
    }, releasePackage: {
      findUnique: async () => ({ nextRunAt: new Date("2026-10-20T09:02Z") }),
      update: async (q: { data: { nextRunAt: Date } }) => { writes.push(q.data); },
    }, $transaction: async (qs: Promise<unknown>[]) => Promise.all(qs),
    scheduleAuditEvent: { create: async () => ({}) } } as unknown as PrismaClient;
    const now = new Date("2026-10-21T01:00Z");
    const sub = { id: "later-member", releasePackageId: "pkg", retryCount,
      nextRunAt: new Date("2026-10-20T09:02Z"), instrument: { code: "failed" } } as SubscriptionWithRelations;
    const next = await backoffFailedPackage(p, sub, "HTTP403", now);
    assert.ok(next > now);
    assert.ok(next.getTime() <= now.getTime() + 72 * 3600000);
    assert.equal(writes.length, 3);
    assert.ok(writes.every(x => x.nextRunAt?.getTime() === next.getTime()));
  }
});
