import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { QUARTER_VALUE_FIELDS } from "./quarterlyWritePlan";
import type { SecQuarterlyFundamentals as Quarter } from "./secFundamentals";
const slot = globalThis as unknown as { prisma?: PrismaClient };
const previous = slot.prisma;
const root = { equityFundamentalSnapshot: {
  upsert: async () => { throw new Error("不能在事务外写入"); },
  deleteMany: async () => { throw new Error("不能在事务外删除旧key"); },
}, $transaction: async (_operation: (client: object) => Promise<unknown>, _options: unknown): Promise<unknown> => { throw new Error("未设置测试事务"); } };
slot.prisma = root as unknown as PrismaClient;
const store = import("./equityFundamentalsStore");
after(() => { slot.prisma = previous; });

function quarter(period: string, fiscalDate: string, revenue: number) {
  const row = { period, fiscalDate, firstReportedAt: "2025-05-01" } as Quarter;
  for (const field of QUARTER_VALUE_FIELDS) Object.assign(row, { [field]: null });
  return { ...row, revenue };
}
async function database(rows: Quarter[], failAt = 0) {
  let state = new Map(rows.map(r => [r.period, { ...r, symbol: "NUE", periodType: "Q", fiscalDate: new Date(`${r.fiscalDate}T00:00:00Z`), firstReportedAt: new Date("2025-05-01T00:00:00Z") } as Record<string, unknown>]));
  let writes = 0; let options: unknown;
  root.$transaction = async (operation: (client: object) => Promise<unknown>, supplied: unknown) => {
    options = supplied;
    const draft = new Map([...state].map(([k, v]) => [k, { ...v }]));
    const client = { equityFundamentalSnapshot: {
      findMany: async () => [...draft.values()],
      upsert: async (args: { where: { symbol_period: { period: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        if (++writes === failAt) throw new Error("模拟事务中途失败");
        const key = args.where.symbol_period.period;
        draft.set(key, draft.has(key) ? { ...draft.get(key), ...args.update } : args.create);
        return draft.get(key);
      },
      deleteMany: async (args: { where: { period: string; fiscalDate: Date } }) => {
        const old = draft.get(args.where.period);
        if (!(old?.fiscalDate instanceof Date) || old.fiscalDate.getTime() !== args.where.fiscalDate.getTime()) return { count: 0 };
        return { count: Number(draft.delete(args.where.period)) };
      },
    } };
    const result = await operation(client); state = draft; return result;
  };
  return { state: () => state, options: () => options, upsert: (await store).upsertQuarterlyFundamentals };
}

test("季度迁移通过共享writer在一个串行化事务中写入和清除旧key", async () => {
  const db = await database([quarter("2026Q1", "2026-01-04", 25)]);
  assert.equal(await db.upsert("NUE", [quarter("2025Q4", "2026-01-04", 99)], { fillMissing: true }), 1);
  assert.equal(db.state().has("2026Q1"), false);
  assert.equal(db.state().get("2025Q4")?.revenue, 25);
  assert.deepEqual(db.options(), { timeout: 30000, maxWait: 5000, isolationLevel: "Serializable" });
});

test("迁移中途失败不留下半条迁移或重复财季", async () => {
  const db = await database([quarter("2025Q2", "2025-04-05", 10), quarter("2025Q3", "2025-07-05", 20)], 2);
  await assert.rejects(db.upsert("NUE", [quarter("2025Q1", "2025-04-05", 99), quarter("2025Q2", "2025-07-05", 99)], { fillMissing: true }), /中途失败/);
  assert.deepEqual([...db.state().keys()], ["2025Q2", "2025Q3"]);
  assert.equal(db.state().get("2025Q2")?.revenue, 10);
});
