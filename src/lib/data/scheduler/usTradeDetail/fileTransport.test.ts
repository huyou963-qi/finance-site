import assert from "node:assert/strict";
import test from "node:test";
import { fetchCensusTradeFile } from "./fileTransport";
import { US_TRADE_FILES } from "./catalog";

test("Census proxy is opt-in, exact-file scoped, fail-closed and credential safe", async () => {
  const savedFetch = globalThis.fetch;
  const savedProxy = process.env.CENSUS_FILE_PROXY_URL;
  const calls: { url: string; init?: RequestInit & { dispatcher?: unknown } }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("xlsx fixture");
  };
  try {
    delete process.env.CENSUS_FILE_PROXY_URL;
    await fetchCensusTradeFile(US_TRADE_FILES.exports);
    assert.equal(calls[0]?.init?.dispatcher, undefined);
    assert.equal(calls[0]?.init?.redirect, "error");
    process.env.CENSUS_FILE_PROXY_URL = "http://127.0.0.1:18080";
    const controller = new AbortController();
    for (const url of Object.values(US_TRADE_FILES)) {
      await fetchCensusTradeFile(url, { signal: controller.signal, headers: { "User-Agent": "test" } });
      const call = calls.at(-1)!;
      assert.ok(call.init?.dispatcher);
      assert.equal(call.init.signal, controller.signal);
      assert.equal(call.init.redirect, "error");
      assert.deepEqual(call.init.headers, { "User-Agent": "test" });
    }
    assert.equal(calls[1]?.init?.dispatcher, calls[4]?.init?.dispatcher);
    const count = calls.length;
    for (const url of ["https://api.census.gov/data", US_TRADE_FILES.exports + "?x=1",
      US_TRADE_FILES.exports.replace("www.census.gov", "www.census.gov.attacker.test"),
      "http://www.census.gov/foreign-trade/balance/country.xlsx"]) {
      await assert.rejects(fetchCensusTradeFile(url), /allowlist/);
    }
    assert.equal(calls.length, count);
    process.env.CENSUS_FILE_PROXY_URL = "socks5://127.0.0.1:18080";
    await assert.rejects(fetchCensusTradeFile(US_TRADE_FILES.exports), /http/);
    process.env.CENSUS_FILE_PROXY_URL = "not a URL with secret";
    await assert.rejects(fetchCensusTradeFile(US_TRADE_FILES.exports), /must be an http/);
    process.env.CENSUS_FILE_PROXY_URL = "http://127.0.0.1:18080";
    globalThis.fetch = async () => { throw new Error("secret proxy password"); };
    await assert.rejects(fetchCensusTradeFile(US_TRADE_FILES.exports), error => {
      assert.match(String(error), /proxy request failed/);
      assert.doesNotMatch(String(error), /secret/);
      return true;
    });
    assert.equal(calls.length, count); // No direct fallback after proxy failure.
  } finally {
    globalThis.fetch = savedFetch;
    if (savedProxy === undefined) delete process.env.CENSUS_FILE_PROXY_URL;
    else process.env.CENSUS_FILE_PROXY_URL = savedProxy;
  }
});
