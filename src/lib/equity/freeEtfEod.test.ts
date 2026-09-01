import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchYahooDailyCloses } from "./freeEtfEod";

describe("freeEtfEod", () => {
  it("fetchYahooDailyCloses parses, sorts and filters a fixed Yahoo response", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    globalThis.fetch = (async (input: string | URL | Request) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        chart: {
          result: [{
            timestamp: [1_700_172_800, 1_700_000_000, 1_700_086_400, Number.NaN],
            indicators: { adjclose: [{ adjclose: [102, 100, null, 999] }] },
          }],
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    try {
      const pts = await fetchYahooDailyCloses("xlk", 60);
      assert.match(requestedUrl, /\/XLK\?interval=1d&range=3mo/);
      assert.deepEqual(pts, [
        { time: 1_700_000_000, close: 100 },
        { time: 1_700_172_800, close: 102 },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
