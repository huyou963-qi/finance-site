import assert from "node:assert/strict";
import test from "node:test";
import {
  parseDeraDate,
  parseDeraBoolean,
  parseRelationship,
  parseTsv,
  assertColumns,
} from "./parseDera";
import { enumerateQuarters, quarterOf, parseQuarter } from "./catalog";
import { classifyAnomaly } from "./ingest";

test("parses DD-MON-YYYY dates as UTC", () => {
  assert.equal(parseDeraDate("31-MAR-2026")?.toISOString().slice(0, 10), "2026-03-31");
  assert.equal(parseDeraDate("05-JAN-2006")?.toISOString().slice(0, 10), "2006-01-05");
  assert.equal(parseDeraDate(" 1-dec-1999 ")?.toISOString().slice(0, 10), "1999-12-01");
});

test("rejects unparseable and overflowing dates instead of silently rolling them", () => {
  assert.equal(parseDeraDate(""), null);
  assert.equal(parseDeraDate("2026-03-31"), null); // ISO 不是源格式
  assert.equal(parseDeraDate("31-XXX-2026"), null);
  // 31-FEB 会被 Date 滚到 3 月，必须拒绝而不是接受成错误日期
  assert.equal(parseDeraDate("31-FEB-2026"), null);
});

test("normalizes the four mixed boolean encodings, keeping empty as unknown", () => {
  // 源里 AFF10B5ONE 同列混用 '0'/'1'/'false'/''
  assert.equal(parseDeraBoolean("1"), true);
  assert.equal(parseDeraBoolean("true"), true);
  assert.equal(parseDeraBoolean("0"), false);
  assert.equal(parseDeraBoolean("false"), false);
  // 空 = 未知，不能当成 false（老季度根本没有这一列）
  assert.equal(parseDeraBoolean(""), null);
  assert.equal(parseDeraBoolean(undefined), null);
});

test("splits the comma-joined relationship into booleans", () => {
  assert.deepEqual(parseRelationship("Director,Officer,TenPercentOwner"), {
    isDirector: true, isOfficer: true, isTenPercentOwner: true, isOther: false,
  });
  assert.deepEqual(parseRelationship("Officer"), {
    isDirector: false, isOfficer: true, isTenPercentOwner: false, isOther: false,
  });
  assert.deepEqual(parseRelationship(""), {
    isDirector: false, isOfficer: false, isTenPercentOwner: false, isOther: false,
  });
});

test("parseTsv drops rows whose column count disagrees with the header", () => {
  const { rows, skipped } = parseTsv("A\tB\tC\n1\t2\t3\nbad\trow\n4\t5\t6\n");
  assert.equal(rows.length, 2);
  assert.equal(skipped, 1);
  assert.deepEqual(rows[0], { A: "1", B: "2", C: "3" });
});

test("assertColumns fails loudly when the source drops a required column", () => {
  assert.throws(() => assertColumns(["A", "B"], ["A", "C"], "TEST.tsv"), /缺列 C/);
  // AFF10B5ONE 是可选列，不在 required 里，老季度缺它不该报错
  assert.doesNotThrow(() => assertColumns(["A", "B"], ["A"], "TEST.tsv"));
});

test("flags only objectively-wrong rows", () => {
  const filed = new Date(Date.UTC(2026, 2, 20));
  const ok = { symbol: "NVDA", transDate: new Date(Date.UTC(2026, 2, 19)), filedAt: filed, price: 175.79 };
  assert.equal(classifyAnomaly(ok), null);
  // BRK.A 约 $70 万/股是真实价格，不能被误判
  assert.equal(classifyAnomaly({ ...ok, price: 700_000 }), null);
  assert.equal(classifyAnomaly({ ...ok, symbol: "NONE" }), "no_ticker");
  assert.equal(
    classifyAnomaly({ ...ok, transDate: new Date(Date.UTC(2028, 2, 19)) }),
    "date_after_filed",
  );
  assert.equal(classifyAnomaly({ ...ok, price: 24_035_774.4 }), "price_impossible");
  // 世纪手误：1912 年不可能有 Form 4（Section 16 自 1934 年才存在）
  assert.equal(
    classifyAnomaly({ symbol: "TLB", transDate: new Date(Date.UTC(1912, 7, 3)), filedAt: new Date(Date.UTC(2012, 7, 7)), price: 1 }),
    "date_impossible",
  );
  // 但 1986 年买入、2007 年申报是合理的迟报，不能误杀
  assert.equal(
    classifyAnomaly({ symbol: "NLCI", transDate: new Date(Date.UTC(1986, 11, 11)), filedAt: new Date(Date.UTC(2007, 6, 9)), price: 5 }),
    null,
  );
});

test("enumerates quarters across year boundaries", () => {
  assert.deepEqual(enumerateQuarters("2025q3", "2026q2"), ["2025q3", "2025q4", "2026q1", "2026q2"]);
  assert.deepEqual(enumerateQuarters("2026q1", "2026q1"), ["2026q1"]);
  assert.equal(enumerateQuarters("2006q1", "2026q1").length, 81);
  assert.equal(quarterOf(new Date("2026-09-07T00:00:00Z")), "2026q3");
  assert.deepEqual(parseQuarter("2026q4"), { year: 2026, quarter: 4 });
  assert.throws(() => parseQuarter("2026Q5"), /季度格式无效/);
});
