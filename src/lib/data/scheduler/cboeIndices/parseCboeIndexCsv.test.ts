import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CBOE_INDEX_SERIES } from "./catalog";
import { parseCboeIndexCsv } from "./parseCboeIndexCsv";

const vix9dConfig = CBOE_INDEX_SERIES.find((s) => s.seriesKey === "vix9d")!;
const vvixConfig = CBOE_INDEX_SERIES.find((s) => s.seriesKey === "vvix")!;

describe("parseCboeIndexCsv", () => {
  it("parses VIX9D CSV (DATE,OPEN,HIGH,LOW,CLOSE) taking CLOSE", () => {
    const csv = [
      "DATE,OPEN,HIGH,LOW,CLOSE",
      "01/04/2011,16.060000,16.060000,16.060000,16.060000",
      "01/05/2011,15.570000,15.570000,15.570000,15.570000",
    ].join("\n");
    const { points, latestObsDate, skippedInvalid } = parseCboeIndexCsv(csv, vix9dConfig);
    assert.deepEqual(
      points.map((p) => [p.obsDate.toISOString().slice(0, 10), p.value]),
      [
        ["2011-01-04", 16.06],
        ["2011-01-05", 15.57],
      ],
    );
    assert.equal(skippedInvalid, 0);
    assert.equal(latestObsDate?.toISOString().slice(0, 10), "2011-01-05");
  });

  it("parses VVIX CSV (DATE,VVIX)", () => {
    const csv = ["DATE,VVIX", "03/06/2006,71.730000", "03/15/2006,15.710000"].join("\n");
    const { points } = parseCboeIndexCsv(csv, vvixConfig);
    assert.deepEqual(
      points.map((p) => [p.obsDate.toISOString().slice(0, 10), p.value]),
      [
        ["2006-03-06", 71.73],
        ["2006-03-15", 15.71],
      ],
    );
  });

  it("skips malformed rows (bad date, non-numeric value)", () => {
    const csv = [
      "DATE,OPEN,HIGH,LOW,CLOSE",
      "01/04/2011,16.06,16.06,16.06,16.06",
      "not-a-date,1,1,1,1",
      "01/06/2011,1,1,1,N/A",
    ].join("\n");
    const { points, skippedInvalid } = parseCboeIndexCsv(csv, vix9dConfig);
    assert.equal(points.length, 1);
    assert.equal(skippedInvalid, 2);
  });

  it("throws when the value column is missing (site structure changed)", () => {
    const csv = ["DATE,OPEN,HIGH,LOW", "01/04/2011,16.06,16.06,16.06"].join("\n");
    assert.throws(() => parseCboeIndexCsv(csv, vix9dConfig), /缺列/);
  });

  it("throws on empty CSV", () => {
    assert.throws(() => parseCboeIndexCsv("", vix9dConfig), /为空/);
  });

  it("throws when all rows are invalid (0 valid points)", () => {
    const csv = ["DATE,VVIX", "bad-date,1"].join("\n");
    assert.throws(() => parseCboeIndexCsv(csv, vvixConfig), /0 个有效点/);
  });

  it("throws on non-monotonic (out-of-order) dates", () => {
    const csv = ["DATE,VVIX", "03/15/2006,71.73", "03/06/2006,15.71"].join("\n");
    assert.throws(() => parseCboeIndexCsv(csv, vvixConfig), /日期倒退/);
  });

  it("throws when value is out of configured sanity range (parser corruption guard)", () => {
    const csv = ["DATE,VVIX", "03/06/2006,999999"].join("\n");
    assert.throws(() => parseCboeIndexCsv(csv, vvixConfig), /值域/);
  });

  it("throws on a future date beyond tolerance", () => {
    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3650);
    const mm = String(farFuture.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(farFuture.getUTCDate()).padStart(2, "0");
    const yyyy = farFuture.getUTCFullYear();
    const csv = ["DATE,VVIX", `${mm}/${dd}/${yyyy},50`].join("\n");
    assert.throws(() => parseCboeIndexCsv(csv, vvixConfig), /未来日期/);
  });
});
