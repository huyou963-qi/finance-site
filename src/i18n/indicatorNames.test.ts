import assert from "node:assert/strict";
import test from "node:test";
import { rowsMissingEnglish, updatesFromDictionary, updatesFromImport } from "@/i18n/indicatorNames";

const rows = [
  { code: "a", name: "失业率", displayName: "美国 · 失业率", nameEn: null },
  { code: "b", name: "CPI（全部城市消费者）", nameEn: "" },
  { code: "c", name: "已有英文", nameEn: "Already English" },
];

test("只处理缺英文名的行", () => {
  assert.deepEqual(rowsMissingEnglish(rows).map((r) => r.code), ["a", "b"]);
});

test("词典：displayName 优先，其次 name", () => {
  const u = updatesFromDictionary(rows, { "美国 · 失业率": "US unemployment rate", "失业率": "Unemployment rate", "CPI（全部城市消费者）": "CPI (all urban consumers)" });
  assert.deepEqual(u, [
    { code: "a", nameEn: "US unemployment rate", source: "dictionary" },
    { code: "b", nameEn: "CPI (all urban consumers)", source: "dictionary" },
  ]);
});

test("导入：默认不覆盖、忽略未知代码与空值", () => {
  const imported = { a: " Unemployment ", c: "New", zzz: "x", b: "  " };
  assert.deepEqual(updatesFromImport(rows, imported).map((u) => [u.code, u.nameEn]), [["a", "Unemployment"]]);
  assert.deepEqual(updatesFromImport(rows, imported, { overwrite: true }).map((u) => u.code), ["a", "c"]);
});
