import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseJgbCsv } from "./parser";
import { JGB_TENORS } from "./catalog";
const header = `Interest Rate,,,,,,,,,,,,,,,(Unit : %)\nDate,${JGB_TENORS.map((n) => `${n}Y`).join(",")}\n`;
const row = `2026/9/1,${JGB_TENORS.map((n) => n === 40 ? "-" : "-0.125").join(",")}\n`;
test("official 1974 CSV excerpt matches MOF published values", () => {
  const text = readFileSync(join(process.cwd(), "src/lib/data/scheduler/japanMofJgb/fixtures/official-excerpt.csv"), "utf8");
  const parsed = parseJgbCsv(text);
  assert.equal(parsed.get(2)![0]!.value, 9.362);
  assert.equal(parsed.get(10)!.length, 0);
  assert.equal(parsed.get(1)!.length, 3);
});
test("named tenors, negative yields and missing long tenor", () => {
  const p = parseJgbCsv(header + row, new Date("2026-09-09"));
  assert.equal(p.get(2)![0]!.value, -0.125);
  assert.equal(p.get(2)![0]!.obsDate.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(p.get(40)!.length, 0);
});
test("reject altered schema, invalid date/value, duplicate and future dates", () => {
  for (const text of [(header + row).replace("2Y", "2X"), header + row.replace("9/1", "2/30"), header + row.replace("-0.125", ""), header + row + row, header]) assert.throws(() => parseJgbCsv(text));
  assert.throws(() => parseJgbCsv(header + row, new Date("2026-08-31")));
});
