import { test } from "node:test";
import assert from "node:assert/strict";
import { retrySerializationFailure } from "./equityFundamentalsStore";

test("serialization conflicts (P2034) are retried; other errors and exhausted retries are thrown", async () => {
  const conflict = Object.assign(new Error("write conflict"), { code: "P2034" });
  let calls = 0;
  const value = await retrySerializationFailure(async () => { calls++; if (calls < 3) throw conflict; return 7; }, 5, async () => {});
  assert.equal(value, 7);
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(retrySerializationFailure(async () => { calls++; throw new Error("other"); }, 5, async () => {}), /other/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(retrySerializationFailure(async () => { calls++; throw conflict; }, 3, async () => {}), /write conflict/);
  assert.equal(calls, 3);
});
