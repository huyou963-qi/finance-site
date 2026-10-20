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
  const paths = {
    safe_cn_bop_0ab8aeb994a9: "2.2.1非储备性质的金融账户/资产",
    safe_cn_bop_0bbe4c71fd7d: "1.A.b.12别处未提及的政府货物和服务/借方",
    safe_cn_bop_0c1cfb69f1e9: "1.B.2.1直接投资/借方",
    safe_cn_bop_0c5b13186fc7: "1.A.b.2维护和维修服务/贷方",
    safe_cn_bop_0cd14bfd3f4b: "1.B.1雇员报酬/贷方",
    safe_cn_bop_0d4374abce6a: "1.B.1雇员报酬/贷方",
    safe_cn_bop_0e08987d1c42: "1.B.3其他初次收入/贷方",
    safe_cn_bop_0e1ecc12f6eb: "1.A.b.9电信、计算机和信息服务/贷方",
    safe_cn_bop_104b38816a59: "1.A.b.4旅行/借方",
    safe_cn_bop_1083ae644b09: "1.A.b服务/借方",
    safe_cn_bop_113a6f38b994: "1.A.b.2维护和维修服务/借方",
  };
  for (const [code, sourceRowPath] of Object.entries(paths)) {
    const member = { code, sourceRowPath } as SafeSeries;
    assert.doesNotThrow(() => assertSafeSeriesIdentity(member));
    assert.throws(() => assertSafeSeriesIdentity({ ...member, sourceRowPath: "another/贷方" }), /父级定义变化/);
  }
});
