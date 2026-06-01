import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SecType } from "@stoqey/ib";
import {
  buildIbkrTwsContract,
  buildIbkrTwsContractForKlineFetch,
} from "@/lib/data/ibkrTwsContract";

describe("ibkr tws contract", () => {
  it("maps MGC=F to CONTFUT on COMEX", () => {
    const spec = buildIbkrTwsContract("MGC=F");
    assert.equal(spec.secType, SecType.CONTFUT);
    assert.equal(spec.contract.symbol, "MGC");
    assert.equal(spec.contract.exchange, "COMEX");
    assert.equal(spec.contract.secType, SecType.CONTFUT);
  });

  it("maps MGCN6 to FUT with contract month", () => {
    const spec = buildIbkrTwsContract("MGCN6");
    assert.equal(spec.secType, SecType.FUT);
    assert.equal(spec.contract.symbol, "MGC");
    assert.equal(spec.contract.lastTradeDateOrContractMonth, "202607");
  });

  it("MGC=F kline fetch stays CONTFUT even with before (no rolled-month pagination)", () => {
    const beforeSec = Math.floor(
      Date.parse("2024-10-22T00:00:00Z") / 1000,
    );
    const spec = buildIbkrTwsContractForKlineFetch("MGC=F", {
      beforeTimeSec: beforeSec,
    });
    assert.equal(spec.secType, SecType.CONTFUT);
    assert.equal(spec.contract.secType, SecType.CONTFUT);
  });
});
