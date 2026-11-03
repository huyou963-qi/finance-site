import { test } from "node:test";
import assert from "node:assert/strict";
import { reportedDurationDifference } from "./secReportedFlows";

test("报表加减只用同申报同区间，两项均明确，包括真实零和负数", () => {
  const p = { start: "2024-01-01", end: "2024-03-31", accn: "a", filed: "2024-05-01", form: "10-Q", val: -10 };
  assert.equal(reportedDurationDifference([p], [{ ...p, val: -3 }])[0]?.val, -7);
  assert.equal(reportedDurationDifference([p], [{ ...p, val: 0 }])[0]?.val, -10);
  assert.deepEqual(reportedDurationDifference([p], []), []);
  for (const other of [{ accn: "b" }, { filed: "2024-05-02" }, { start: "2023-01-01" }, { end: "2024-06-30" }, { form: "8-K" }, { val: NaN }]) {
    assert.deepEqual(reportedDurationDifference([p], [{ ...p, ...other }]), []);
  }
  assert.deepEqual(reportedDurationDifference([p], [{ ...p, val: 2 }, { ...p, val: 3 }]), []);
});
