import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { runRecordedDisclosureBatch } from "./disclosureBatchRunner";

function harness(mode: "success" | "partial" | "missing-index" | "fatal" = "success") {
  const writes: Record<string, unknown>[] = [];
  const db = { equityDisclosureBatch: {
    updateMany: async ({ data }: { data: Record<string, unknown> }) => { writes.push({ interrupted: data }); return { count: 0 }; },
    create: async ({ data }: { data: Record<string, unknown> }) => { writes.push({ created: data }); return { id: "batch" }; },
    update: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); return {}; },
  } } as unknown as PrismaClient;
  const sync: NonNullable<Parameters<typeof runRecordedDisclosureBatch>[1]>["syncDailyDisclosures"] = async (options, _deps, progress) => {
    if (mode === "fatal") throw new Error("source failed");
    const result = { days: ["2020-10-23"], coveredCompanies: 1, indexed: 1, complete: 1, pending: 0,
      failed: mode === "partial" ? 1 : 0, remaining: mode === "partial" ? 2 : 0,
      missingIndexes: mode === "missing-index" ? ["2020-10-23"] : [], failedCiks: [], timingUpdated: 0 };
    if (!options?.dryRun) await progress?.({ coveredCiks: ["0000320193"], failedCiks: [], missingIndexes: result.missingIndexes, indexed: 1, failed: result.failed });
    return result;
  };
  return { writes, dependencies: { prisma: db, syncDailyDisclosures: sync } };
}

test("record the scope, discovery coverage and final successful counters", async () => {
  const h = harness();
  await runRecordedDisclosureBatch({ through: "2020-10-23", days: 1, symbols: ["aapl"] }, h.dependencies);
  assert.deepEqual((h.writes[1].created as { symbols: string[] }).symbols, ["AAPL"]);
  assert.deepEqual(h.writes[2].coveredCiks, ["0000320193"]);
  assert.equal(h.writes.at(-1)?.status, "success");
  assert.equal(h.writes.at(-1)?.indexed, 1);
});

test("partial source coverage or backlog is never recorded as a complete success", async () => {
  for (const mode of ["partial", "missing-index"] as const) {
    const h = harness(mode);
    await runRecordedDisclosureBatch({ through: "2020-10-23", days: 1 }, h.dependencies);
    assert.equal(h.writes.at(-1)?.status, "partial");
  }
});

test("fatal errors persist a failed batch and propagate to the CLI", async () => {
  const h = harness("fatal");
  await assert.rejects(() => runRecordedDisclosureBatch({ through: "2020-10-23", days: 1 }, h.dependencies), /source failed/);
  assert.equal(h.writes.at(-1)?.status, "failed");
  assert.ok(h.writes.at(-1)?.finishedAt);
});

test("dry-run does not create a fake successful run or interrupt any existing batch", async () => {
  const h = harness();
  await runRecordedDisclosureBatch({ dryRun: true }, h.dependencies);
  assert.deepEqual(h.writes, []);
});
