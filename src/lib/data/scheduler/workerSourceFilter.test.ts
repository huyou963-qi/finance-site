import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { listDueSubscriptions } from "./runSubscription";

test("source filter is applied before selecting due package work units", async () => {
  let where: unknown;
  const prisma = {
    dataSubscription: { findMany: async (args: { where: unknown }) => { where = args.where; return []; } },
  } as unknown as PrismaClient;
  await listDueSubscriptions(prisma, 20, { sourceId: "fred" });
  assert.equal((where as { sourceId: string }).sourceId, "fred");
  await listDueSubscriptions(prisma, 20, { excludeSourceIds: ["safe-external"] });
  assert.deepEqual((where as { sourceId: unknown }).sourceId, { notIn: ["safe-external"] });
});
