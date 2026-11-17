import assert from "node:assert/strict";
import test from "node:test";
import {
  CPI_MOM_MATRIX_MAX_MONTHS,
  clampCpiMomMonthRange,
  cpiMomMonthSpanInclusive,
  defaultCpiMomMonthRange,
  filterCpiMomColumns,
  shiftCpiMomMonthPeriod,
} from "./cpiMomMatrixRange";

const months = [
  "2025-01-01",
  "2025-02-01",
  "2025-03-01",
  "2025-04-01",
  "2025-05-01",
  "2025-06-01",
  "2025-07-01",
  "2025-08-01",
  "2025-09-01",
  "2025-10-01",
  "2025-11-01",
  "2025-12-01",
  "2026-01-01",
  "2026-02-01",
  "2026-03-01",
  "2026-04-01",
  "2026-05-01",
  "2026-06-01",
  "2026-07-01",
  "2026-08-01",
  "2026-09-01",
  "2026-10-01",
];

test("cpiMomMonthSpanInclusive counts inclusive calendar months", () => {
  assert.equal(cpiMomMonthSpanInclusive("2026-04", "2026-10"), 7);
  assert.equal(cpiMomMonthSpanInclusive("2026-04-01", "2026-10-01"), 7);
  assert.equal(cpiMomMonthSpanInclusive("2025-11-01", "2026-10-01"), 12);
  assert.equal(cpiMomMonthSpanInclusive("2025-10-01", "2026-10-01"), 13);
});

test("shiftCpiMomMonthPeriod preserves day suffix", () => {
  assert.equal(shiftCpiMomMonthPeriod("2026-04-01", 6), "2026-10-01");
  assert.equal(shiftCpiMomMonthPeriod("2026-10-01", -11), "2025-11-01");
  assert.equal(shiftCpiMomMonthPeriod("2026-04", 1), "2026-05");
});

test("defaultCpiMomMonthRange uses last N available months", () => {
  assert.deepEqual(defaultCpiMomMonthRange(months, 7), {
    start: "2026-04-01",
    end: "2026-10-01",
  });
});

test("clampCpiMomMonthRange keeps start when end stretches past 12 months", () => {
  const r = clampCpiMomMonthRange(months, "2025-10-01", "2026-10-01", "end");
  assert.deepEqual(r, { start: "2025-11-01", end: "2026-10-01" });
  assert.equal(cpiMomMonthSpanInclusive(r!.start, r!.end), CPI_MOM_MATRIX_MAX_MONTHS);
});

test("clampCpiMomMonthRange keeps end when start stretches past 12 months", () => {
  const r = clampCpiMomMonthRange(months, "2025-10-01", "2026-10-01", "start");
  assert.deepEqual(r, { start: "2025-10-01", end: "2026-09-01" });
  assert.equal(cpiMomMonthSpanInclusive(r!.start, r!.end), CPI_MOM_MATRIX_MAX_MONTHS);
});

test("clampCpiMomMonthRange collapses inverted range toward the changed side", () => {
  assert.deepEqual(clampCpiMomMonthRange(months, "2026-08-01", "2026-04-01", "start"), {
    start: "2026-08-01",
    end: "2026-08-01",
  });
  assert.deepEqual(clampCpiMomMonthRange(months, "2026-08-01", "2026-04-01", "end"), {
    start: "2026-04-01",
    end: "2026-04-01",
  });
});

test("filterCpiMomColumns returns inclusive available months", () => {
  assert.deepEqual(filterCpiMomColumns(months, "2026-04-01", "2026-10-01"), [
    "2026-04-01",
    "2026-05-01",
    "2026-06-01",
    "2026-07-01",
    "2026-08-01",
    "2026-09-01",
    "2026-10-01",
  ]);
});
