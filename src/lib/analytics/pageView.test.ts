import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deviceTypeFromUserAgent,
  isBotUserAgent,
  isTrackedPath,
  isValidClientId,
  normalizePath,
  referrerHost,
  shanghaiDayKey,
  shanghaiDayKeys,
  shanghaiDayStart,
} from "./pageView";

const CHROME_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/128.0 Safari/537.36";

test("isBotUserAgent", () => {
  assert.equal(isBotUserAgent(CHROME_WIN), false);
  assert.equal(isBotUserAgent(IPHONE), false);
  assert.equal(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)"), true);
  assert.equal(isBotUserAgent("Baiduspider"), true);
  assert.equal(isBotUserAgent("Mozilla/5.0 HeadlessChrome/120"), true);
  assert.equal(isBotUserAgent("curl/8.4.0"), true);
  assert.equal(isBotUserAgent(null), true);
});

test("deviceTypeFromUserAgent", () => {
  assert.equal(deviceTypeFromUserAgent(CHROME_WIN), "desktop");
  assert.equal(deviceTypeFromUserAgent(IPHONE), "mobile");
  assert.equal(deviceTypeFromUserAgent(ANDROID_TABLET), "tablet");
});

test("normalizePath", () => {
  assert.equal(normalizePath("/macro?x=1#a"), "/macro");
  assert.equal(normalizePath("/equity/stock/AAPL/"), "/equity/stock/AAPL");
  assert.equal(normalizePath("/"), "/");
  assert.equal(normalizePath("/%E5%AE%8F%E8%A7%82"), "/宏观");
  assert.equal(normalizePath("https://evil.com/x"), null);
  assert.equal(normalizePath("//evil.com"), null);
  assert.equal(normalizePath(42), null);
  assert.equal(normalizePath("/" + "a".repeat(500))?.length, 300);
});

test("isTrackedPath", () => {
  assert.equal(isTrackedPath("/macro"), true);
  assert.equal(isTrackedPath("/administrator-guide"), true);
  assert.equal(isTrackedPath("/admin"), false);
  assert.equal(isTrackedPath("/admin/analytics"), false);
  assert.equal(isTrackedPath("/api/x"), false);
});

test("isValidClientId", () => {
  assert.equal(isValidClientId("0123456789abcdef0123456789abcdef"), true);
  assert.equal(isValidClientId("short"), false);
  assert.equal(isValidClientId("has space inside!"), false);
  assert.equal(isValidClientId(undefined), false);
});

test("referrerHost", () => {
  assert.equal(referrerHost("https://www.google.com/search?q=x", "gekko.tech"), "google.com");
  assert.equal(referrerHost("https://gekko.tech/macro", "gekko.tech"), null);
  assert.equal(referrerHost("http://localhost:3000/a", "localhost:3000"), null);
  assert.equal(referrerHost("", "gekko.tech"), null);
  assert.equal(referrerHost("not a url", "gekko.tech"), null);
  assert.equal(referrerHost("android-app://com.tencent.mm/", "gekko.tech"), null);
});

test("shanghai day helpers", () => {
  // 2026-09-10 17:30Z = 上海 2026-09-11 01:30
  const now = new Date("2026-09-10T17:30:00Z");
  assert.equal(shanghaiDayKey(now), "2026-09-11");
  assert.equal(shanghaiDayStart(now, 0).toISOString(), "2026-09-10T16:00:00.000Z");
  const start = shanghaiDayStart(now, 2);
  assert.equal(start.toISOString(), "2026-09-08T16:00:00.000Z");
  assert.deepEqual(shanghaiDayKeys(start, 3), ["2026-09-09", "2026-09-10", "2026-09-11"]);
});
