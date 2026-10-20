import test from "node:test";
import assert from "node:assert/strict";
import { fetchMarketQuote } from "./marketQuoteProvider";

test("quotes use provider latest price and previous session close, with cache and regional currencies", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls++;
    const url = String(input);
    if (url.includes("eastmoney")) {
      assert.ok(url.includes("fltt=2"));
      return new Response(JSON.stringify({ rc: 0, data: { f43: 25, f60: 20, f124: 0 } }));
    }
    assert.ok(url.includes("interval=1m") && url.includes("range=1d"));
    return new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 120, previousClose: 100, chartPreviousClose: 90, currency: "USD", regularMarketTime: 1700000000 } }] } }));
  };
  try {
    const us = await fetchMarketQuote("QUOTE-TEST");
    assert.equal(us?.price, 120);
    assert.ok(Math.abs(us!.changePercent! - 20) < 1e-10);
    assert.equal(us?.time, 1700000000);
    assert.deepEqual(await fetchMarketQuote("QUOTE-TEST"), us);
    assert.equal(calls, 1);
    const hk = await fetchMarketQuote("00700.HK");
    assert.equal(hk?.price, 25);
    assert.equal(hk?.changePercent, 25);
    assert.equal(hk?.currency, "HKD");
    assert.equal(hk?.time, null);
    const gold = await fetchMarketQuote("XAUUSD");
    assert.equal(gold?.currency, "USD");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
