import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expirationMatchesIbMonth,
  pickFrontTrsrvFuture,
  pickNearestTrsrvFutureByIbMonth,
  pickTrsrvFutureByIbMonth,
  type TrsrvFutureRow,
} from "@/lib/data/ibkrFuturesTrsrv";

const rows: TrsrvFutureRow[] = [
  {
    symbol: "MGC",
    conid: 1,
    underlyingConid: 10,
    expirationDate: 20260527,
    ltd: 20260526,
  },
  {
    symbol: "MGC",
    conid: 2,
    underlyingConid: 10,
    expirationDate: 20260728,
    ltd: 20260727,
  },
];

describe("ibkr trsrv futures pickers", () => {
  it("matches JUL26 by expiration YYYYMM", () => {
    assert.equal(expirationMatchesIbMonth(20260728, "JUL26"), true);
    assert.equal(expirationMatchesIbMonth(20260527, "JUL26"), false);
  });

  it("picks front month by expiration date", () => {
    assert.equal(
      pickFrontTrsrvFuture(rows, new Date("2026-05-20T00:00:00Z"))?.conid,
      1,
    );
    assert.equal(
      pickFrontTrsrvFuture(rows, new Date("2026-06-15T00:00:00Z"))?.conid,
      2,
    );
  });

  it("picks explicit ib month", () => {
    assert.equal(pickTrsrvFutureByIbMonth(rows, "JUL26")?.conid, 2);
  });

  it("nearest month when MGC has no July listed", () => {
    assert.equal(pickTrsrvFutureByIbMonth(rows, "JUL26"), null);
    assert.equal(pickNearestTrsrvFutureByIbMonth(rows, "JUL26")?.conid, 2);
    assert.equal(
      pickNearestTrsrvFutureByIbMonth(rows, "JUL26")?.expirationDate,
      20260728,
    );
  });
});
