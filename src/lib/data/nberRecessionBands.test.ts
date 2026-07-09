import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  markAreaDataForCategories,
  usrecSeriesToBands,
} from "./nberRecessionBands";

describe("nberRecessionBands", () => {
  it("compresses consecutive USREC=1 months into bands", () => {
    const cats = ["2007-11", "2007-12", "2008-01", "2008-02", "2009-06", "2009-07"];
    const vals = [0, 1, 1, 1, 1, 0];
    const bands = usrecSeriesToBands(cats, vals);
    assert.equal(bands.length, 1);
    assert.equal(bands[0]!.startLabel, "2007-12");
    assert.equal(bands[0]!.endLabel, "2009-06");
    assert.ok(bands[0]!.startMs < bands[0]!.endMs);
  });

  it("maps bands onto monthly chart categories", () => {
    const bands = usrecSeriesToBands(
      ["2020-01", "2020-02", "2020-03", "2020-04", "2020-05"],
      [0, 1, 1, 1, 0],
    );
    const mark = markAreaDataForCategories(
      ["2019-12", "2020-01", "2020-02", "2020-03", "2020-04", "2020-05", "2020-06"],
      bands,
    );
    assert.equal(mark.length, 1);
    assert.equal(mark[0]![0].xAxis, "2020-02");
    assert.equal(mark[0]![1].xAxis, "2020-04");
  });

  it("maps monthly recession onto quarterly categories", () => {
    const bands = usrecSeriesToBands(
      ["2008-01", "2008-02", "2008-03", "2008-04"],
      [1, 1, 1, 1],
    );
    const mark = markAreaDataForCategories(["2007-Q4", "2008-Q1", "2008-Q2", "2008-Q3"], bands);
    assert.equal(mark.length, 1);
    assert.equal(mark[0]![0].xAxis, "2008-Q1");
    assert.equal(mark[0]![1].xAxis, "2008-Q2");
  });

  it("skips bands outside visible categories", () => {
    const bands = usrecSeriesToBands(["2001-03", "2001-04"], [1, 1]);
    const mark = markAreaDataForCategories(["2010-01", "2010-02"], bands);
    assert.equal(mark.length, 0);
  });
});
