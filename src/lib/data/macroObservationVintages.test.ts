import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFredRevisionRows } from "./scheduler/adapters/fredAdapter";

test("FRED output_type=3 宽表展开为不可覆盖 vintage 行", () => {
  const parsed = parseFredRevisionRows("CPIAUCSL", [
    {
      date: "2026-01-01",
      CPIAUCSL_20260213: "100.0",
      CPIAUCSL_20260310: "100.2",
    },
    { date: "2026-02-01", CPIAUCSL_20260310: "101.0" },
    { date: "2026-03-01", CPIAUCSL_20260410: "." },
  ]);
  assert.equal(parsed.length, 3);
  const january = parsed.filter((row) => row.obsDate.toISOString().startsWith("2026-01-01"));
  assert.equal(january.length, 2);
  assert.equal(january[0]?.value, 100);
  assert.equal(january[0]?.isInitialRelease, true);
  assert.equal(january[0]?.realtimeStart.toISOString().slice(0, 10), "2026-02-13");
  assert.equal(january[0]?.realtimeEnd?.toISOString().slice(0, 10), "2026-03-09");
  assert.equal(january[1]?.value, 100.2);
  assert.equal(january[1]?.isInitialRelease, false);
  assert.equal(january[1]?.realtimeEnd, null);
});

test("重复 vintage key 去重且无效数字被忽略", () => {
  const parsed = parseFredRevisionRows("PAYEMS", [
    { date: "2026-01-01", PAYEMS_20260201: "10" },
    { date: "2026-01-01", PAYEMS_20260201: "10" },
    { date: "2026-02-01", PAYEMS_20260301: "not-a-number" },
  ]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.value, 10);
});
