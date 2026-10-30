import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { repairSafeHierarchyDefinitions } from "./repairHierarchyDefinitions";
import reviewed from "./reviewedHierarchyDefinitions.json";

function fixture() {
  const rows = reviewed.slice(0, 2).map((r, index) => ({ id: String(index), code: r.code, name: r.previousName, shortName: "old",
    metadata: { keep: 7, scrape: { provider: "safe_external" } } as Record<string, unknown>,
    dataSubscription: { sourceId: "safe-external", sourceSeriesKey: r.sourceSeriesKey } }));
  let reads = 0, writes = 0;
  const tx = { instrument: {
    findMany: async ({ where }: { where: { code: { in: string[] } } }) => { assert.equal(where.code.in.length, 365); reads++; return rows; },
    update: async ({ where, data }: { where: { id: string }; data: Partial<typeof rows[number]> }) => { Object.assign(rows.find(row => row.id === where.id)!, data); writes++; },
  } };
  const prisma = { $transaction: async (fn: (t: typeof tx) => Promise<unknown>, options: unknown) => {
    assert.deepEqual(options, { isolationLevel: "Serializable", timeout: 15_000 }); return fn(tx);
  } } as unknown as PrismaClient;
  return { prisma, rows, reads: () => reads, writes: () => writes };
}
test("one bounded read, metadata-only updates, idempotence and absent-member preservation", async () => {
  const f = fixture();
  assert.deepEqual(await repairSafeHierarchyDefinitions(f.prisma), { reviewed: 365, existing: 2, changed: 2, absent: 363 });
  assert.equal(f.reads(), 1); assert.equal(f.writes(), 2);
  assert.equal(f.rows[0]!.metadata.keep, 7);
  assert.deepEqual(f.rows[0]!.metadata.scrape, { provider: "safe_external", sourceRowPath: reviewed[0]!.sourceRowPath });
  assert.equal(f.rows[0]!.id, "0");
  assert.equal(f.rows[0]!.dataSubscription.sourceSeriesKey, reviewed[0]!.sourceSeriesKey);
  assert.equal((await repairSafeHierarchyDefinitions(f.prisma)).changed, 0);
  assert.equal(f.writes(), 2);
});
test("all members are checked before first write; unexpected key/name/parent cannot be overwritten", async () => {
  for (const field of ["key", "name", "parent"]) {
    const f = fixture(), row = f.rows[1]!;
    if (field === "key") row.dataSubscription.sourceSeriesKey = "different";
    if (field === "name") row.name = "manual reviewed name";
    if (field === "parent") row.metadata.scrape = { sourceRowPath: "another parent" };
    await assert.rejects(repairSafeHierarchyDefinitions(f.prisma), /SAFE 定义修复/);
    assert.equal(f.writes(), 0);
  }
});
