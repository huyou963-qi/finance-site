import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fundingHistoryStart,
  isCalendarMonthEnd,
  monthKey,
  previousCompletedMonthEnd,
} from "./monthlyProduction";

describe("monthly quant production calendar", () => {
  it("targets the preceding completed month", () => {
    assert.equal(previousCompletedMonthEnd(new Date("2026-09-02T11:00:00.000Z")), "2026-08-31");
    assert.equal(previousCompletedMonthEnd(new Date("2026-09-01T00:00:00.000Z")), "2026-08-31");
  });

  it("handles year and leap-month boundaries", () => {
    assert.equal(previousCompletedMonthEnd(new Date("2026-01-15T00:00:00.000Z")), "2025-12-31");
    assert.equal(previousCompletedMonthEnd(new Date("2024-03-01T00:00:00.000Z")), "2024-02-29");
  });

  it("accepts only exact calendar month ends", () => {
    assert.equal(isCalendarMonthEnd("2026-08-31"), true);
    assert.equal(isCalendarMonthEnd("2024-02-29"), true);
    assert.equal(isCalendarMonthEnd("2026-08-30"), false);
    assert.equal(isCalendarMonthEnd("2026-02-30"), false);
    assert.equal(monthKey("2026-08-31"), "2026-08");
    assert.throws(() => monthKey("2026-08-30"), /自然月末/);
  });

  it("bounds the 13F history needed by an incremental build", () => {
    assert.equal(fundingHistoryStart("2026-08-31"), "2025-02-01");
    assert.equal(fundingHistoryStart("2024-02-29", 6), "2023-08-01");
    assert.throws(() => fundingHistoryStart("not-a-date"), /非法日期/);
  });
});
