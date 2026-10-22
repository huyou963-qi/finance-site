import assert from "node:assert/strict";
import test from "node:test";
import { FredRateLimiter } from "./fredRateLimiter";

test("JSON gateway failures retry boundedly without consuming the response or leaking secrets", async () => {
  const original = globalThis.fetch;
  const url = "https://api.stlouisfed.org/fred/series?file_type=json&api_key=SECRET";
  let calls = 0;
  const limiter = new FredRateLimiter({ minIntervalMs: 0, maxRetries: 2, retryWaitMs: 0 });
  try {
    globalThis.fetch = async () => ++calls === 1
      ? new Response("<html>SECRET</html>") : Response.json({ observations: [] });
    assert.deepEqual(await (await limiter.fetch(url)).json(), { observations: [] });
    assert.equal(calls, 2);
    calls = 0;
    globalThis.fetch = async () => { calls++; return new Response("<html>SECRET</html>"); };
    await assert.rejects(limiter.fetch(url), error => {
      assert.equal((error as Error).message, "FRED invalid JSON response (HTTP 200)");
      return true;
    });
    assert.equal(calls, 2);
    calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({ error_code: 400 }, { status: 400 }); };
    assert.equal((await limiter.fetch(url)).status, 400);
    assert.equal(calls, 1);
    calls = 0;
    await assert.rejects(limiter.fetch(url, { signal: AbortSignal.abort() }));
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});
