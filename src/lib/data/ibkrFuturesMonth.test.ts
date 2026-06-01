import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickIbFutMonthForAsOf, pickNearestIbMonth } from "@/lib/data/ibkrFuturesMonth";

describe("ibkr futures month (TWS cont pagination)", () => {
  it("pickNearestIbMonth when July not listed", () => {
    const listed = ["JUN26", "AUG26"];
    assert.equal(pickNearestIbMonth(listed, "JUL26"), "AUG26");
  });

  it("pickIbFutMonthForAsOf Oct 2024 MGC picks OCT24", () => {
    const sec = Math.floor(Date.parse("2024-10-22T00:00:00Z") / 1000);
    assert.equal(pickIbFutMonthForAsOf("MGC", sec), "OCT24");
  });
});
