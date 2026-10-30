import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { createSafeHierarchy, safeHierarchyDisplay, safePeriodSemantics } from "./hierarchy";
import reviewed from "./reviewedHierarchyDefinitions.json";
import { assertSafeSeriesIdentity, parseSafeExternalSheet } from "./client";

test("settlement keeps direction and secondary-column meaning and fails on unknown direction", () => {
  const resolve = createSafeHierarchy("settlement");
  assert.equal(resolve("1.经常项目", ""), undefined);
  resolve("二、售汇", "");
  assert.deepEqual(resolve("1.经常项目", ""), ["二、售汇", "1.经常项目"]);
  assert.deepEqual(resolve("五、远期结售汇平仓额", "Balance"), ["五、远期结售汇平仓额", "差额"]);
  assert.throws(() => resolve("七、本期末远期结售汇累计未到期额", ""), /缺少明确/);
  assert.throws(() => resolve("九、未知项目", ""), /未知/);
});

test("annual current-year flow and stock definitions remain explicit without changing dates or values", () => {
  const dataset = { key: "settlement" as const, label: "银行结售汇", category: "外汇收支", pages: [] };
  const sheet = XLSX.utils.aoa_to_sheet([["单位：亿美元"], ["项目", null, 2025, 2026],
    ["一、结汇", null, 100, 80], ["八、未到期期权Delta净敞口", null, -3, 0]]);
  const rows = parseSafeExternalSheet(dataset, "以美元计价（年度）", sheet);
  assert.match(rows[0]!.label, /最新年度累计／历年全年/);
  assert.match(rows[1]!.label, /最新披露期末／历年年末/);
  assert.deepEqual(rows[0]!.points.map(p => [p.obsDate.toISOString().slice(0, 10), p.value]), [["2025-01-01", 100], ["2026-01-01", 80]]);
  assert.deepEqual(rows[1]!.points.map(p => p.value), [-3, 0]);
  assert.equal(safePeriodSemantics("settlement", "以美元计价（月度）", "八、未到期期权Delta净敞口"), "period_end_stock");
});

test("debt sector and contractual maturity reset independently", () => {
  const resolve = createSafeHierarchy("debt");
  resolve("广义政府", ""); resolve("长期", "");
  assert.deepEqual(resolve("贷款", ""), ["广义政府", "长期", "贷款"]);
  assert.deepEqual(resolve("中央银行", ""), ["中央银行"]);
  assert.equal(resolve("贷款", ""), undefined); // A removed maturity heading cannot borrow the old sector's term.
  assert.equal(resolve("新增未知部门", ""), undefined);
  resolve("短期", "");
  assert.deepEqual(resolve("贷款", ""), ["中央银行", "短期", "贷款"]);
  resolve("直接投资：公司间贷款", "");
  assert.deepEqual(resolve("对关联企业的债务负债", ""), ["直接投资：公司间贷款", "对关联企业的债务负债"]);
});

test("IIP asset/liability blocks, implicit .0 levels and financial-sector suffixes retain meaning", () => {
  const resolve = createSafeHierarchy("iip");
  resolve("资产", ""); resolve("1 直接投资", ""); resolve("1.a 金融部门", "");
  assert.deepEqual(resolve("1.1.a 股权", ""), ["资产", "1 直接投资", "1.a 金融部门", "1.1.a 股权"]);
  resolve("4 其他投资", ""); resolve("4.3 贷款", ""); resolve("4.3.4 其他部门", "");
  assert.deepEqual(resolve("4.3.4.0.2 长期", ""), ["资产", "4 其他投资", "4.3 贷款", "4.3.4 其他部门", "4.3.4.0.2 长期"]);
  resolve("负债", "");
  assert.throws(() => resolve("4.3.4.0.2 长期", ""), /缺少父级/);
  resolve("4 其他投资", ""); resolve("4.3 贷款", ""); resolve("4.3.4 其他部门", "");
  assert.equal(resolve("4.3.4.0.2 长期", "")![0], "负债");
});

test("all 365 reviewed keys retain IDs and reject parent drift", () => {
  assert.equal(reviewed.length, 365);
  assert.equal(new Set(reviewed.map(row => row.code)).size, 365);
  for (const row of reviewed) {
    const [dataset, sheet] = row.sourceSeriesKey.split("|");
    assert.equal(row.code, `safe_cn_${dataset}_${createHash("sha1").update(row.sourceSeriesKey).digest("hex").slice(0, 12)}`);
    const series = { code: row.code, key: row.sourceSeriesKey, dataset: dataset as "settlement" | "debt" | "iip", label: row.displayName,
      unit: "", category: "", points: [], freqLabel: "年" as const, sourceRowPath: row.sourceRowPath };
    assert.doesNotThrow(() => assertSafeSeriesIdentity(series));
    assert.throws(() => assertSafeSeriesIdentity({ ...series, sourceRowPath: "不同父级" }), /拒绝按行序串项/);
    assert.ok(safeHierarchyDisplay(series.dataset, sheet!, ["test"]).includes(sheet!.split("（")[0]!));
  }
});
