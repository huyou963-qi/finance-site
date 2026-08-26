import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFrequency } from "./fredCatalog";

test("normalizes every supported catalog frequency alias", () => {
  const cases = [
    ["日", "日"], ["日频", "日"], ["daily", "日"],
    ["周", "周"], ["周频", "周"], ["weekly", "周"],
    ["月", "月"], ["月频", "月"], ["monthly", "月"],
    ["季", "季度"], ["季度", "季度"], ["季频", "季度"], ["quarterly", "季度"],
    ["年", "年"], ["年度", "年"], ["年频", "年"], ["annual", "年"],
  ] as const;

  for (const [input, expected] of cases) {
    assert.equal(normalizeFrequency(input), expected, input);
  }
});

test("keeps the legacy monthly fallback for blank or unknown labels", () => {
  assert.equal(normalizeFrequency(null), "月");
  assert.equal(normalizeFrequency(""), "月");
  assert.equal(normalizeFrequency("unknown"), "月");
});
