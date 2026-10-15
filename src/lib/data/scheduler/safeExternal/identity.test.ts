import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { assertSafeSeriesIdentity, parseSafeExternalSheet, type SafeSeries } from "./client";
const dataset = { key: "bop" as const, label: "国际收支", category: "外汇", pages: [] };
test("BOP generic debit/credit labels include their numbered parent without changing keys", () => {
  const rows = [["单位：亿SDR"], ["项目", 2024, 2025], ["1.A.b.8 知识产权使用费", 1, 2], ["贷方", 3, 4], ["借方", -5, -6]];
  const series = parseSafeExternalSheet(dataset, "年度BOP（SDR)", XLSX.utils.aoa_to_sheet(rows));
  const debit = series.find((s) => s.sourceRowPath?.endsWith("/借方"))!;
  assert.equal(debit.sourceRowPath, "1.A.b.8知识产权使用费/借方");
  assert.match(debit.label, /知识产权使用费：借方/);
  assert.equal(debit.key, "bop|年度BOP（SDR)|借方|1|亿SDR");
});
test("audited legacy IDs fail closed rather than inheriting another ordinal row", () => {
  const series = { code: "safe_cn_bop_00f0898e6481", sourceRowPath: "1.A.b.8知识产权使用费/借方" } as SafeSeries;
  assert.doesNotThrow(() => assertSafeSeriesIdentity(series));
  assert.throws(() => assertSafeSeriesIdentity({ ...series, sourceRowPath: "1.A.b.7金融服务/借方" }), /父级定义变化/);
  assert.throws(() => assertSafeSeriesIdentity(series, "another/借方"), /父级定义变化/);
});
