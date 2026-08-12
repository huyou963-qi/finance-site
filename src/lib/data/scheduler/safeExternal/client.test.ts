import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseSafeExternalSheet } from "./client";

test("parses SAFE workbook rows and preserves monthly official values", () => {
  const sheet = XLSX.utils.aoa_to_sheet([["银行结售汇（以人民币计价）"], ["单位：亿元人民币"], ["项目", 45292, 45323], ["一、结汇", 18889, 19001]]);
  const series = parseSafeExternalSheet({ key: "settlement", label: "银行结售汇", category: "外汇收支与跨境资金", pages: [] }, "以人民币计价（月度）", sheet);
  assert.equal(series.length, 1); assert.equal(series[0]?.unit, "亿元人民币"); assert.equal(series[0]?.freqLabel, "月"); assert.deepEqual(series[0]?.points.map((point) => [point.obsDate.toISOString().slice(0, 10), point.value]), [["2024-01-01", 18889], ["2024-02-01", 19001]]);
});

test("keeps official reserve USD and SDR columns as separate series", () => {
  const sheet = XLSX.utils.aoa_to_sheet([["官方储备资产"], [null, null, null, null, null], ["项目", 2026.01, null, 2026.02, null], [null, "亿美元", "亿SDR", "亿美元", "亿SDR"], ["1. 外汇储备", "33990.78", "24597.67", "34278.07", "24933.77"], ["4. 黄金", "3695.82", "2674.51", "3875.88", "2819.30"]]);
  const series = parseSafeExternalSheet({ key: "reserve", label: "官方储备资产", category: "外汇储备与黄金", pages: [] }, "Sheet1", sheet);
  assert.equal(series.length, 4); assert.equal(series.find((item) => item.label.endsWith("外汇储备") && item.unit === "亿美元")?.points[0]?.value, 33990.78); assert.equal(series.find((item) => item.label.endsWith("黄金") && item.unit === "亿SDR")?.points[1]?.value, 2819.3);
});

test("parses SAFE quarterly BOP headers and assigns stable canonical codes", () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["中国国际收支平衡表（季度表）"],
    ["单位:亿美元"],
    ["项目", "2025Q1", "2025Q2", "2025Q3", "2025Q4"],
    ["1. 经常账户", 100, 120, 130, 140],
    ["   1.A.a 货物", 200, 210, 220, 230],
    ["   1.A.b 服务", -80, -75, -70, -65],
    ["2.2.1.1 直接投资", 10, -20, 30, -40],
    ["2.2.1.2证券投资", -50, -60, -70, -80],
    ["2.2.1.4其他投资", 90, 80, 70, 60],
  ]);
  const series = parseSafeExternalSheet({ key: "bop", label: "国际收支平衡表", category: "国际收支与对外头寸", pages: [] }, "季度BOP（美元）", sheet);
  assert.equal(series.length, 6);
  assert.deepEqual(series.map((item) => item.code), [
    "safe_cn_bop_current_account",
    "safe_cn_bop_goods_balance",
    "safe_cn_bop_services_balance",
    "safe_cn_bop_direct_investment_net",
    "safe_cn_bop_portfolio_investment_net",
    "safe_cn_bop_other_investment_net",
  ]);
  assert.equal(series[0]?.freqLabel, "季");
  assert.deepEqual(series[0]?.points.map((point) => point.obsDate.toISOString().slice(0, 10)), ["2025-03-01", "2025-06-01", "2025-09-01", "2025-12-01"]);
});
