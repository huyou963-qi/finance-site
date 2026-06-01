import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { futuresContractRoot } from "@/lib/chart/executionSymbolMatch";
import {
  extractMonthsFromSecdefSearch,
  isValidIbkrSymbolInput,
  parseIbkrFutMonthSpec,
  pickFrontIbMonth,
} from "@/lib/data/ibkrKlines";

describe("ibkr symbol input", () => {
  it("accepts futures month codes with digits", () => {
    assert.equal(isValidIbkrSymbolInput("MGCN6"), true);
    assert.equal(isValidIbkrSymbolInput("GCJ5"), true);
    assert.equal(isValidIbkrSymbolInput("MGC=F"), true);
  });

  it("rejects empty or illegal characters", () => {
    assert.equal(isValidIbkrSymbolInput(""), false);
    assert.equal(isValidIbkrSymbolInput("MGC N6"), false);
    assert.equal(isValidIbkrSymbolInput("foo@bar"), false);
  });

  it("parses MGCN6 root as MGC", () => {
    assert.equal(futuresContractRoot("MGCN6"), "MGC");
  });

  it("maps MGCN6 to IB secdef month JUL26", () => {
    assert.deepEqual(parseIbkrFutMonthSpec("MGCN6"), {
      root: "MGC",
      ibMonth: "JUL26",
    });
    assert.deepEqual(parseIbkrFutMonthSpec("GCJ5"), {
      root: "GC",
      ibMonth: "APR25",
    });
  });

  it("picks front month from secdef months list", () => {
    const months = extractMonthsFromSecdefSearch([
      {
        sections: [
          {
            secType: "FUT",
            months: "MAY26;JUN26;JUL26;AUG26",
          },
        ],
      },
    ]);
    assert.deepEqual(months, ["MAY26", "JUN26", "JUL26", "AUG26"]);
    assert.equal(
      pickFrontIbMonth(months, new Date("2026-05-20T00:00:00Z")),
      "MAY26",
    );
    assert.equal(
      pickFrontIbMonth(months, new Date("2026-06-15T00:00:00Z")),
      "JUN26",
    );
  });
});
