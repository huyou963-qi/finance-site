import { test } from "node:test";
import assert from "node:assert/strict";
import { BAIDU_TONGJI_ID, isTrackedPath } from "./baiduTongji";

test("BAIDU_TONGJI_ID 是 32 位十六进制", () => {
  assert.match(BAIDU_TONGJI_ID, /^[a-f0-9]{32}$/);
});

test("isTrackedPath 排除后台与接口", () => {
  assert.equal(isTrackedPath("/"), true);
  assert.equal(isTrackedPath("/macro"), true);
  assert.equal(isTrackedPath("/equity/stocks/AAPL"), true);
  assert.equal(isTrackedPath("/administrator-guide"), true);
  assert.equal(isTrackedPath("/admin"), false);
  assert.equal(isTrackedPath("/admin/users"), false);
  assert.equal(isTrackedPath("/api/data/klines"), false);
});
