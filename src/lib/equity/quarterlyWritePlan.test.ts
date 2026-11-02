import { test } from "node:test";
import assert from "node:assert/strict";
import { planQuarterlyWrite, quarterlyWriteWindow, type StoredQuarter } from "./quarterlyWritePlan";
import type { SecQuarterlyFundamentals as Quarter } from "./secFundamentals";

function row(period: string, fiscalDate: string, revenue = 100): Quarter {
  return { period, fiscalDate, fiscalQuarter: 1, revenue, revenueYoY: null, grossMargin: null, opMargin: null, netIncome: 10,
    eps: null, epsYoY: null, ocf: 20, capex: 5, dividendsPaid: null, buybackPaid: null, totalAssets: null,
    totalLiabilities: null, equity: null, longTermDebt: null, cash: null, sharesOutstanding: null, firstReportedAt: "2025-05-01" };
}

test("首周错标链按实际日期重排，补齐新季度且不把旧金额复制到另一财季", () => {
  const old = [row("2025Q2", "2025-04-05", 10), row("2025Q3", "2025-07-05", 20), row("2025Q4", "2025-12-31", 40)];
  const incoming = [row("2025Q1", "2025-04-05", 999), row("2025Q2", "2025-07-05", 999), row("2025Q3", "2025-10-04", 30), row("2025Q4", "2025-12-31", 999)];
  const plan = planQuarterlyWrite(incoming, old, true);
  assert.deepEqual(plan.rows.map(r => [r.period, r.revenue]), [["2025Q1", 10], ["2025Q2", 20], ["2025Q3", 30]]);
  assert.equal(plan.relabelled.length, 2);
  assert.deepEqual(plan.obsolete, []); // 原key已被另一真实财季复用
});

test("跨年迁移保留实际财季；无新财季复用的遗留key才可移除", () => {
  const old = row("2026Q1", "2026-01-04", 25);
  const plan = planQuarterlyWrite([row("2025Q4", "2026-01-04", 99)], [old], true);
  assert.equal(plan.rows[0]?.revenue, 25);
  assert.equal(plan.rows[0]?.period, "2025Q4");
  assert.deepEqual(plan.obsolete, [{ period: "2026Q1", fiscalDate: "2026-01-04" }]);
});

test("迁移后EPS同比按修正季度重算，缺可比基线则清除旧错标同比", () => {
  const prior = { ...row("2024Q1", "2024-03-30"), eps: 2 };
  const old = { ...row("2025Q2", "2025-04-05"), eps: 3, epsYoY: 99 };
  const plan = planQuarterlyWrite([], [prior, old], true);
  assert.equal(plan.rows.find(r => r.period === "2025Q1")?.epsYoY, 0.5);
  assert.equal(planQuarterlyWrite([], [old], true).rows[0]?.epsYoY, null);
});

test("正常日批仍接受非空重述，但缺失的源字段不能清空已入库补充事实", () => {
  const old = row("2025Q1", "2025-03-31", 100);
  const update = { ...old, revenue: 110, capex: null };
  const result = planQuarterlyWrite([update], [old]).rows[0]!;
  assert.equal(result.revenue, 110);
  assert.equal(result.capex, 5);
  assert.equal(planQuarterlyWrite([old], [old]).rows.length, 0);
});

test("只补空值按真实财季保留非空金额并重新锚定财季编号", () => {
  const old = { ...row("2025Q3", "2025-08-16", 100), capex: null };
  const fresh = { ...old, revenue: 999, capex: 9, fiscalQuarter: 2, firstReportedAt: "2026-01-01" };
  const result = planQuarterlyWrite([fresh], [old], true).rows[0]!;
  assert.equal(result.revenue, 100);
  assert.equal(result.capex, 9);
  assert.equal(result.fiscalQuarter, 2);
  assert.equal(result.firstReportedAt, "2026-01-01");
});

test("迁移落点有另一实际财季或不明日期时拒绝，避免覆盖已有事实", () => {
  const moved = row("2025Q2", "2025-04-05", 10);
  assert.throws(() => planQuarterlyWrite([], [moved, row("2025Q1", "2025-03-31", 20)], true), /冲突/);
  assert.throws(() => planQuarterlyWrite([], [moved, { ...row("2025Q1", "2025-03-31"), fiscalDate: null }], true), /缺少真实财季/);
});

test("同一实际财季重复key合并补充字段，删除副本不会导致金额重复计数", () => {
  const correct = { ...row("2025Q1", "2025-04-05", 10), capex: null };
  const legacy = row("2025Q2", "2025-04-05", 10);
  const plan = planQuarterlyWrite([correct], [legacy, correct], true);
  assert.equal(plan.rows[0]?.revenue, 10);
  assert.equal(plan.rows[0]?.capex, 5);
  assert.equal(plan.obsolete.length, 1);
  assert.throws(() => planQuarterlyWrite([correct], [{ ...legacy, revenue: 11 }, correct], true), /副本金额冲突/);
});

test("普通不同季末冲突在只补模式保留原记录；数据库Date与ISO日期一致", () => {
  const old: StoredQuarter = { ...row("2025Q1", "2025-03-30", 10), fiscalDate: new Date("2025-03-30T00:00:00Z") };
  const plan = planQuarterlyWrite([row("2025Q1", "2025-03-31", 20)], [old], true);
  assert.deepEqual(plan.rows, []);
  assert.deepEqual(plan.skipped, ["2025Q1"]);
  assert.throws(() => quarterlyWriteWindow(Array.from({ length: 81 }, () => row("2025Q1", "2025-03-31"))), /1–80/);
  assert.throws(() => quarterlyWriteWindow([row("2025Q1", "2025-03-31"), row("2025Q1", "2025-03-31")] ), /重复/);
});
