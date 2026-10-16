import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMembershipSource } from "./client";

test("在线名单失败时明确报错，禁止静默拿7月快照替代10月名单", async () => {
  const fetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("fixture network unavailable"); };
  try {
    await assert.rejects(loadMembershipSource(true), /禁止自动回退旧快照/);
  } finally { globalThis.fetch = fetch; }
});
