import assert from "node:assert/strict";
import test from "node:test";
import { latestCompletedQuarter, previousQuarter } from "./fundamentalsAgg";

test("财报季使用当前自然季度的前一季", () => {
  assert.equal(latestCompletedQuarter(new Date("2026-08-26T00:00:00Z")), "2026Q2");
  assert.equal(latestCompletedQuarter(new Date("2026-02-10T00:00:00Z")), "2025Q4");
});

test("前季标签正确跨年", () => {
  assert.equal(previousQuarter("2026Q2"), "2026Q1");
  assert.equal(previousQuarter("2026Q1"), "2025Q4");
});
