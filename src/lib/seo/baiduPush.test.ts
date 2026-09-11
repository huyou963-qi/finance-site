import { test } from "node:test";
import assert from "node:assert/strict";
import { applyBaiduResponse, baiduPushEndpoint, chunkUrls, emptyPushResult } from "./baiduPush";
import { absoluteUrl, getSiteUrl, isLocalSiteUrl } from "./siteUrl";

test("baiduPushEndpoint encodes site and token", () => {
  assert.equal(
    baiduPushEndpoint("https://www.example.com", "abc123"),
    "http://data.zz.baidu.com/urls?site=https%3A%2F%2Fwww.example.com&token=abc123",
  );
});

test("chunkUrls", () => {
  assert.deepEqual(chunkUrls(["a", "b", "c"], 2), [["a", "b"], ["c"]]);
  assert.deepEqual(chunkUrls([], 2), []);
});

test("applyBaiduResponse merges success batches", () => {
  const acc = emptyPushResult();
  assert.equal(applyBaiduResponse(acc, 200, { success: 2, remain: 98, not_valid: ["x"] }), true);
  assert.equal(applyBaiduResponse(acc, 200, { success: 1, remain: 97, not_same_site: ["y"] }), true);
  assert.deepEqual(acc, { success: 3, remain: 97, notSameSite: ["y"], notValid: ["x"], errors: [] });
});

test("applyBaiduResponse stops on quota / token errors", () => {
  const acc = emptyPushResult();
  assert.equal(applyBaiduResponse(acc, 400, { error: 400, message: "over quota" }), false);
  assert.equal(applyBaiduResponse(acc, 401, { error: 401, message: "token is not valid" }), false);
  assert.equal(applyBaiduResponse(acc, 500, null), true);
  assert.deepEqual(acc.errors, ["over quota", "token is not valid", "HTTP 500"]);
});

test("site url helpers", () => {
  const prev = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = "https://www.example.com/";
  try {
    assert.equal(getSiteUrl(), "https://www.example.com");
    assert.equal(absoluteUrl("/macro"), "https://www.example.com/macro");
    assert.equal(absoluteUrl("macro"), "https://www.example.com/macro");
  } finally {
    if (prev === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = prev;
  }
  assert.equal(isLocalSiteUrl("http://localhost:3000"), true);
  assert.equal(isLocalSiteUrl("https://www.example.com"), false);
  assert.equal(isLocalSiteUrl("not a url"), true);
});
