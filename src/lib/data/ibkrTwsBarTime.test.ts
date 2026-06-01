import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseIbkrTwsBarTimeToUnix } from "@/lib/data/ibkrTwsBarTime";

describe("ibkr tws bar time", () => {
  it("parses YYYYMMDD daily bars", () => {
    const t = parseIbkrTwsBarTimeToUnix("20240315");
    assert.equal(t, Math.floor(Date.UTC(2024, 2, 15) / 1000));
  });

  it("parses finished marker as null", () => {
    assert.equal(parseIbkrTwsBarTimeToUnix("finished-20240101-20240315"), null);
  });
});
