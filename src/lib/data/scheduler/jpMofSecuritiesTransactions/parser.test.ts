import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseJpMofSecuritiesCsv } from "./parser";

const fixture = readFileSync(path.join(__dirname, "fixtures", "monthly-sample.csv"), "utf8");

test("normalizes four net-acquisition series from official gross fields", () => {
  const parsed = parseJpMofSecuritiesCsv(fixture, 2);
  assert.deepEqual(parsed.mof_jp_securities_resident_foreign_equity_net.map((point) => point.value), [1100, -200]);
  assert.deepEqual(parsed.mof_jp_securities_resident_foreign_debt_net.map((point) => point.value), [350, -250]);
  assert.deepEqual(parsed.mof_jp_securities_nonresident_japan_equity_net.map((point) => point.value), [700, -200]);
  assert.deepEqual(parsed.mof_jp_securities_nonresident_japan_debt_net.map((point) => point.value), [530, -170]);
});

test("rejects a published net that disagrees with acquisition minus disposition", () => {
  assert.throws(() => parseJpMofSecuritiesCsv(fixture.replace('"1,100"', '"1,090"'), 2), /net identity changed/);
});
