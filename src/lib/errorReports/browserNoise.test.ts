import assert from "node:assert/strict";
import test from "node:test";
import { isEmptyAdResponse, isExtensionScriptError, isPageExitAbort } from "./browserNoise";

const emptyAd = {
  code: 30005,
  message: "Ad loaded,but response or ad data is empty, and reqId is : d74cb3dfde1e4bdd93f18abbf015854a",
};

test("过滤已知广告空数据对象与 JSON 字符串，支持不同请求 ID", () => {
  assert.equal(isEmptyAdResponse(emptyAd), true);
  assert.equal(isEmptyAdResponse(JSON.stringify(emptyAd)), true);
  assert.equal(isEmptyAdResponse({ ...emptyAd, message: emptyAd.message.replace(/d74c.*$/, "0123456789abcdef0123456789abcdef") }), true);
});

test("保留业务异常、其他广告错误和不完整的空数据错误", () => {
  for (const reason of [null, undefined, 30005, "ad error", "{invalid JSON", [],
    { code: 30005, message: "business failure" },
    { ...emptyAd, code: 30006 }, { ...emptyAd, code: "30005" },
    { message: emptyAd.message }, { ...emptyAd, message: emptyAd.message + " extra" },
    new Error(emptyAd.message), Object.assign(new Error(emptyAd.message), { code: 30005 }),
  ]) assert.equal(isEmptyAdResponse(reason), false);
});

test("识别 Chrome/Firefox/Safari 插件实际抛错位置", () => {
  for (const scheme of ["chrome-extension", "moz-extension", "safari-web-extension"]) {
    const url = `${scheme}://example/userscript.js:8:14`;
    assert.equal(isExtensionScriptError(url), true);
    assert.equal(isExtensionScriptError(undefined, `ReferenceError: require is not defined\n    at Proxy.<anonymous> (${url})\n    at app.js:1:1`), true);
    assert.equal(isExtensionScriptError(undefined, `fn@${url}\nother@https://example.com/app.js:1:1`), true);
  }
});

test("本站错误即使后续调用栈或错误消息提及插件仍须上报", () => {
  const app = "https://example.com/_next/static/chunks/app.js:1:1";
  const extension = "chrome-extension://example/script.js:1:1";
  assert.equal(isExtensionScriptError(app, `Error\n    at ${extension}`), false);
  assert.equal(isExtensionScriptError(undefined, `Error: ${extension}\n    at ${app}\n    at ${extension}`), false);
  assert.equal(isExtensionScriptError(undefined, "Error: require is not defined"), false);
  assert.equal(isExtensionScriptError(`${app}?url=${extension}`), false);
  assert.equal(isExtensionScriptError(undefined, `Error\n    at ${app}?url=${extension}`), false);
  assert.equal(isExtensionScriptError(), false);
});

test("仅页面离开期间的 AbortError 是导航取消，其他错误与恢复后的取消仍上报", () => {
  const abort = new DOMException("signal is aborted without reason", "AbortError");
  assert.equal(isPageExitAbort(abort, true), true);
  assert.equal(isPageExitAbort(abort, false), false);
  assert.equal(isPageExitAbort(new Error("signal is aborted without reason"), true), false);
  assert.equal(isPageExitAbort({ name: "TimeoutError" }, true), false);
  assert.equal(isPageExitAbort("AbortError", true), false);
  assert.equal(isPageExitAbort(null, true), false);
});
