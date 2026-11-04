import assert from "node:assert/strict";
import test from "node:test";
import { fetchCensusPartnerApiHttp, fetchCensusTradeFile } from "./fileTransport";
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

test("Census partner API uses the same opt-in proxy and stays on intltrade allowlist", async () => {
  const savedFetch = globalThis.fetch;
  const savedProxy = process.env.CENSUS_FILE_PROXY_URL;
  const calls: { url: string; init?: RequestInit & { dispatcher?: unknown } }[] = [];
  const apiUrl = "https://api.census.gov/data/timeseries/intltrade/exports/hs?get=CTY_CODE&key=x";
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("[]");
  };
  try {
    delete process.env.CENSUS_FILE_PROXY_URL;
    await fetchCensusPartnerApiHttp(apiUrl);
    assert.equal(calls[0]?.init?.dispatcher, undefined);
    assert.equal(calls[0]?.init?.redirect, "manual");

    process.env.CENSUS_FILE_PROXY_URL = "http://127.0.0.1:18080";
    await fetchCensusPartnerApiHttp(apiUrl, { signal: AbortSignal.timeout(5_000) });
    assert.ok(calls[1]?.init?.dispatcher);
    assert.equal(calls[1]?.init?.redirect, "manual");

    for (const url of [
      "https://api.census.gov/data/2020/acs/acs5",
      "https://www.census.gov/foreign-trade/balance/country.xlsx",
      "http://api.census.gov/data/timeseries/intltrade/exports/hs",
      "https://evil.test/data/timeseries/intltrade/exports/hs",
    ]) {
      await assert.rejects(fetchCensusPartnerApiHttp(url), /allowlist/);
    }
    assert.equal(calls.length, 2);

    globalThis.fetch = async () => { throw new Error("secret proxy password"); };
    await assert.rejects(fetchCensusPartnerApiHttp(apiUrl), error => {
      assert.match(String(error), /proxy request failed/);
      assert.doesNotMatch(String(error), /secret/);
      return true;
    });
  } finally {
    globalThis.fetch = savedFetch;
    if (savedProxy === undefined) delete process.env.CENSUS_FILE_PROXY_URL;
    else process.env.CENSUS_FILE_PROXY_URL = savedProxy;
  }
});
