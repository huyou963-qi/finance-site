import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchYahooDailyCloses } from "./freeEtfEod";

describe("freeEtfEod", () => {
  it("fetchYahooDailyCloses returns XLK closes", async () => {
    const pts = await fetchYahooDailyCloses("XLK", 60);
    assert.ok(pts.length >= 20, `expected >=20 points, got ${pts.length}`);
    assert.ok(pts[0]!.time < pts[pts.length - 1]!.time);
    assert.ok(pts[pts.length - 1]!.close > 0);
  });
});
