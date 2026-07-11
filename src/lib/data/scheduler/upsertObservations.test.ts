import assert from "node:assert/strict";
import { test } from "node:test";
import { upsertMacroObservations } from "./upsertObservations";
import type { PrismaClient } from "@prisma/client";

/** 最小内存版 macroObservation 表，只实现 upsertMacroObservations 用到的三个方法 */
function makeFakePrisma(seed: { obsDate: string; value: number }[] = []) {
  const rows = new Map<number, { obsDate: Date; value: number }>();
  for (const s of seed) {
    const d = new Date(`${s.obsDate}T00:00:00Z`);
    rows.set(d.getTime(), { obsDate: d, value: s.value });
  }
  let updates = 0;
  let inserts = 0;

  const prisma = {
    macroObservation: {
      async findMany({ where }: { where: { obsDate: { in: Date[] } } }) {
        return where.obsDate.in
          .map((d) => rows.get(d.getTime()))
          .filter((r): r is { obsDate: Date; value: number } => r != null)
          .map((r) => ({ obsDate: r.obsDate, value: r.value }));
      },
      async update({
        where,
        data,
      }: {
        where: { instrumentId_obsDate: { obsDate: Date } };
        data: { value: number };
      }) {
        const t = where.instrumentId_obsDate.obsDate.getTime();
        rows.set(t, { obsDate: where.instrumentId_obsDate.obsDate, value: data.value });
        updates += 1;
      },
      async createMany({ data }: { data: { obsDate: Date; value: number }[] }) {
        let count = 0;
        for (const d of data) {
          if (!rows.has(d.obsDate.getTime())) {
            rows.set(d.obsDate.getTime(), { obsDate: d.obsDate, value: d.value });
            count += 1;
            inserts += 1;
          }
        }
        return { count };
      },
    },
  } as unknown as PrismaClient;

  return { prisma, stats: () => ({ updates, inserts }), rows };
}

const pt = (obsDate: string, value: number) => ({
  obsDate: new Date(`${obsDate}T00:00:00Z`),
  value,
});

test("brand-new rows count as inserted, not overwrites", async () => {
  const { prisma, stats } = makeFakePrisma([]);
  const r = await upsertMacroObservations(prisma, "inst", [
    pt("2026-03-01", 100),
    pt("2026-04-01", 110),
  ]);
  assert.equal(r.inserted, 2);
  assert.equal(r.changed, 0);
  assert.equal(r.unchanged, 0);
  assert.equal(r.upserted, 2);
  assert.equal(stats().updates, 0);
  assert.equal(r.latestObsDate?.toISOString().slice(0, 10), "2026-04-01");
  assert.equal(r.latestValue, 110);
});

test("re-writing identical values is unchanged, not upserted (the reported bug)", async () => {
  const seed = [
    { obsDate: "2026-02-01", value: 100 },
    { obsDate: "2026-03-01", value: 110 },
    { obsDate: "2026-04-01", value: 120 },
    { obsDate: "2026-05-01", value: 130 },
  ];
  const { prisma, stats } = makeFakePrisma(seed);
  const r = await upsertMacroObservations(
    prisma,
    "inst",
    seed.map((s) => pt(s.obsDate, s.value)),
  );
  // 老实现会返回 upserted=4（把 "+4 success" 显示给用户）；新实现应为 0
  assert.equal(r.upserted, 0);
  assert.equal(r.inserted, 0);
  assert.equal(r.changed, 0);
  assert.equal(r.unchanged, 4);
  assert.equal(stats().updates, 0, "不应对相同值做空转写库");
  assert.equal(r.latestObsDate?.toISOString().slice(0, 10), "2026-05-01");
});

test("a revised value counts as changed and is written", async () => {
  const { prisma, stats } = makeFakePrisma([{ obsDate: "2026-05-01", value: 130 }]);
  const r = await upsertMacroObservations(prisma, "inst", [
    pt("2026-05-01", 131), // 修订
    pt("2026-06-01", 140), // 新月份
  ]);
  assert.equal(r.inserted, 1);
  assert.equal(r.changed, 1);
  assert.equal(r.unchanged, 0);
  assert.equal(r.upserted, 2);
  assert.equal(stats().updates, 1);
  assert.equal(r.latestObsDate?.toISOString().slice(0, 10), "2026-06-01");
  assert.equal(r.latestValue, 140);
});

test("non-finite values are skipped, not counted", async () => {
  const { prisma } = makeFakePrisma([]);
  const r = await upsertMacroObservations(prisma, "inst", [
    pt("2026-05-01", Number.NaN),
    pt("2026-06-01", 140),
  ]);
  assert.equal(r.skipped, 1);
  assert.equal(r.inserted, 1);
  assert.equal(r.upserted, 1);
  assert.equal(r.latestObsDate?.toISOString().slice(0, 10), "2026-06-01");
});
