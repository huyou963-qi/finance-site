import assert from "node:assert/strict";
import { it } from "node:test";
import { alignEventMarkersToBars } from "./alignEventMarkers";

const t = Date.parse("2026-10-02T12:00:00Z") / 1000;
it("maps an exact release onto its 1h/4h bar and preserves event time", () => {
  const r = alignEventMarkersToBars([{ time: t + 1800, datePrecision: "DATETIME" }], [t, t + 3600], "1h");
  assert.equal(r[0].time, t); assert.equal(r[0].eventTime, t + 1800);
  assert.equal(alignEventMarkersToBars([{ time: t + 5400, datePrecision: "DATETIME" }], [t, t + 14400], "4h")[0].time, t);
});
it("keeps date-only events at first available bar and aligns daily timestamps", () => {
  assert.equal(alignEventMarkersToBars([{ time: t - 12 * 3600, datePrecision: "DATE" }], [t, t + 3600], "1h")[0].time, t);
  assert.equal(alignEventMarkersToBars([{ time: t + 1800, datePrecision: "DATETIME" }], [t - 12 * 3600], "1d")[0].time, t - 12 * 3600);
});
it("does not attach an out-of-range event to the last candle", () => {
  assert.deepEqual(alignEventMarkersToBars([{ time: t + 86400, datePrecision: "DATETIME" }], [t], "1h"), []);
});
