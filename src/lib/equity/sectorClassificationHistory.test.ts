import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeClassificationInput,
  validateClassificationIntervals,
} from "./sectorClassificationHistory";

test("normalizeClassificationInput normalizes aliases and dates", () => {
  const row = normalizeClassificationInput({
    symbol: "aapl",
    scheme: "GICS",
    sector: "technology",
    validFrom: "2023-03-17",
    source: "licensed-gics-history",
  });
  assert.equal(row.symbol, "AAPL");
  assert.equal(row.sector, "Information Technology");
  assert.equal(row.validTo, null);
});

test("validateClassificationIntervals rejects overlapping effective periods", () => {
  const first = normalizeClassificationInput({ symbol: "META", sector: "Information Technology", validFrom: "2017-01-01", validTo: "2018-12-31", source: "test" });
  const second = normalizeClassificationInput({ symbol: "META", sector: "Communication Services", validFrom: "2018-09-28", source: "test" });
  assert.throws(() => validateClassificationIntervals([first, second]), /重叠/);
});
