import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowRateLimit,
  pruneRateLimitMaps,
  resetRateLimitMapsForTests,
} from "./rateLimit";

test("allowRateLimit 支持 cost 并在窗口内累计", () => {
  resetRateLimitMapsForTests();
  assert.equal(allowRateLimit("t:cost", 10, 60_000, 4), true);
  assert.equal(allowRateLimit("t:cost", 10, 60_000, 4), true);
  assert.equal(allowRateLimit("t:cost", 10, 60_000, 3), false);
});

test("pruneRateLimitMaps 删除过期键", () => {
  resetRateLimitMapsForTests();
  assert.equal(allowRateLimit("t:old", 1, 1), true);
  // 窗口已过
  const later = Date.now() + 10;
  pruneRateLimitMaps(later);
  assert.equal(allowRateLimit("t:old", 1, 60_000), true);
});
