import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { repairReviewedPaymentDefinitions, REVIEWED_PAYMENT_DEFINITIONS } from "./paymentDefinitions";

function fixture(changedKey = false) {
  const definition = REVIEWED_PAYMENT_DEFINITIONS[0]!;
  const row = { id: "reviewed", name: definition.previousName, shortName: "legacy",
    metadata: { preserved: "keep", scrape: { provider: "safe_external" } } as Record<string, unknown> };
  let writes = 0;
  const tx = {
    instrument: {
      findUnique: async ({ where }: { where: { code: string } }) => where.code === definition.code ? row : null,
      update: async ({ data }: { data: Partial<typeof row> }) => { Object.assign(row, data); writes++; },
    },
    dataSubscription: { findUnique: async () => ({ sourceId: "safe-external",
      sourceSeriesKey: changedKey ? "payments|changed" : definition.sourceSeriesKey }) },
  };
  // Only the definition methods exist: accidental schedule/observation writes fail.
  const prisma = { $transaction: async (fn: (client: typeof tx) => Promise<number>, options: unknown) => {
    assert.deepEqual(options, { isolationLevel: "Serializable", timeout: 15_000 });
    return fn(tx);
  } } as unknown as PrismaClient;
  return { prisma, row, writes: () => writes, definition };
}

test("reviewed definition migration is bounded, idempotent, preserves metadata, and skips absent instruments", async () => {
  const state = fixture();
  assert.equal(await repairReviewedPaymentDefinitions(state.prisma), 1);
  assert.equal(state.row.name, state.definition.name);
  assert.equal(state.row.shortName, state.definition.displayName);
  assert.equal(state.row.metadata.preserved, "keep");
  assert.deepEqual(state.row.metadata.scrape, { provider: "safe_external", sourceRowPath: state.definition.sourceRowPath });
  assert.equal(await repairReviewedPaymentDefinitions(state.prisma), 0);
  assert.equal(state.writes(), 1);
});

test("migration refuses changed source identity or unexpected user-edited names", async () => {
  const source = fixture(true);
  await assert.rejects(repairReviewedPaymentDefinitions(source.prisma), /source identity changed/);
  assert.equal(source.writes(), 0);
  const name = fixture();
  name.row.name = "another reviewed definition";
  await assert.rejects(repairReviewedPaymentDefinitions(name.prisma), /name changed/);
  assert.equal(name.writes(), 0);
  const parent = fixture();
  parent.row.metadata.scrape = { sourceRowPath: "另一个父级" };
  await assert.rejects(repairReviewedPaymentDefinitions(parent.prisma), /parent changed/);
  assert.equal(parent.writes(), 0);
});
