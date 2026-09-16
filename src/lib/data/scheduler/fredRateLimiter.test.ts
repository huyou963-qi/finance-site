import assert from "node:assert/strict";
import { FredRateLimiter } from "./fredRateLimiter";

async function testRetriesGatewayError() {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("temporary gateway failure", { status: calls === 1 ? 502 : 200 });
  }) as typeof fetch;
  try {
    const limiter = new FredRateLimiter({ minIntervalMs: 0, maxRetries: 2, retryWaitMs: 0 });
    assert.equal((await limiter.fetch("https://example.test")).status, 200);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

testRetriesGatewayError()
  .then(() => console.log("[fredRateLimiter] tests passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
