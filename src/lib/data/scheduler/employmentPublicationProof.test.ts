import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { runDataSubscription, type SubscriptionWithRelations } from "./runSubscription";

test("employment catch-up saves publication proof even when calendar already points at next release", async () => {
  const writes: Array<Record<string, unknown>> = [];
  const obsDate = new Date("2026-09-01"), published = new Date("2026-10-02T14:00:00Z");
  const prisma = {
    $queryRaw: async () => [{ exists: false }],
    fetchRun: { create: async () => ({ id: "run" }), update: async () => ({}) },
    macroObservation: { findFirst: async () => ({ obsDate }) },
    dataSubscription: {
      findUnique: async () => ({ nextRunAt: new Date("2100-01-01") }),
      update: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); return {}; },
    },
    scheduleAuditEvent: { create: async () => ({}) },
  } as unknown as PrismaClient;
  const sub = { id: "sub", instrumentId: "instrument", enabled: true, retryCount: 0,
    sourceSeriesKey: "PAYEMS", releasePackageId: "us.bls.employment_situation", revisionLookback: 3,
    source: { adapterKind: "FRED_API" }, instrument: { code: "sched_fred_PAYEMS", metadata: {} },
    releaseRule: { type: "economic_calendar" },
    releasePackage: { id: "us.bls.employment_situation", releaseTemplate: { type: "economic_calendar" },
      scheduleState: { calendarMatch: { eventId: "next", title: "Next employment", syncedAt: "2026-10-20T00:00:00Z", releaseAt: "2100-01-01T13:30:00Z" } } },
  } as unknown as SubscriptionWithRelations;
  const result = await runDataSubscription(prisma, sub, { force: true, preserveNextRunAt: true,
    fetchIncremental: async () => ({ points: [], skippedInvalid: 0, sourceLatestObsDate: obsDate, sourcePublishedAt: published }),
  });
  assert.equal(result.status, "skipped");
  const proof = writes.find((row) => row.releaseRule)?.releaseRule as { sourceSync?: { sourcePublishedAt?: string } };
  assert.equal(proof?.sourceSync?.sourcePublishedAt, published.toISOString());
});
