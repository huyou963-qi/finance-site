import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  getIbkrApiMode,
  getIbkrTwsConnectionOptions,
  isIbkrCpMode,
  isIbkrTwsMode,
} from "@/lib/data/ibkrApiConfig";

describe("ibkr api mode", () => {
  const prev = process.env.IBKR_API_MODE;

  afterEach(() => {
    if (prev === undefined) delete process.env.IBKR_API_MODE;
    else process.env.IBKR_API_MODE = prev;
  });

  it("defaults to cp", () => {
    delete process.env.IBKR_API_MODE;
    assert.equal(getIbkrApiMode(), "cp");
    assert.equal(isIbkrCpMode(), true);
    assert.equal(isIbkrTwsMode(), false);
  });

  it("honors tws switch", () => {
    process.env.IBKR_API_MODE = "tws";
    assert.equal(getIbkrApiMode(), "tws");
    assert.equal(isIbkrTwsMode(), true);
  });

  it("parses TWS connection defaults", () => {
    delete process.env.IBKR_TWS_HOST;
    delete process.env.IBKR_TWS_PORT;
    delete process.env.IBKR_TWS_CLIENT_ID;
    const o = getIbkrTwsConnectionOptions();
    assert.equal(o.host, "127.0.0.1");
    assert.equal(o.port, 7496);
    assert.equal(o.clientId, 1);
  });
});
