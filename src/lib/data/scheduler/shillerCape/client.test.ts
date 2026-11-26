import assert from "node:assert/strict";
import test from "node:test";
import { clearShillerCapeCache, fetchShillerCapePage } from "./client";

test("multpl retries a transport failure and caches only the successful page", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  clearShillerCapeCache();
  globalThis.fetch = async () => {
    if (++calls === 1) throw new TypeError("fetch failed");
    return new Response("source page");
  };
  try {
    assert.equal(await fetchShillerCapePage(), "source page");
    assert.equal(await fetchShillerCapePage(), "source page");
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; clearShillerCapeCache(); }
});

test("multpl does not retry permanent HTTP errors", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("denied", { status: 403 }); };
  try {
    await assert.rejects(fetchShillerCapePage(), /HTTP 403/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; clearShillerCapeCache(); }
});
