import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseJpCustomsTradeCsv } from "./parser";

const fixture = readFileSync(path.join(__dirname, "fixtures", "world-monthly-sample.csv"), "utf8");

test("parses totals, derives balance, converts units and excludes future zero placeholders", () => {
  const parsed = parseJpCustomsTradeCsv(fixture, new Date("1979-04-01T00:00:00Z"), 2);
  assert.deepEqual(parsed.customs_jp_trade_exports_total_nsa.map((point) => point.value), [10, 12]);
  assert.deepEqual(parsed.customs_jp_trade_imports_total_nsa.map((point) => point.value), [8, 13]);
  assert.deepEqual(parsed.customs_jp_trade_balance_nsa.map((point) => point.value), [2, -1]);
});

test("rejects a one-sided zero total", () => {
  assert.throws(
    () => parseJpCustomsTradeCsv(fixture.replace("1979/02,1200000 ,1300000", "1979/02,0 ,1300000"), new Date("1979-04-01T00:00:00Z"), 2),
    /one-sided zero/,
  );
});
