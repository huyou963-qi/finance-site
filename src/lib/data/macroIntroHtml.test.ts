import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeMacroIntroHtml } from "./macroIntroHtml";

test("template introduction keeps editor formatting and removes unsafe markup", () => {
  const html = sanitizeMacroIntroHtml(
    '<p style="line-height:1.5"><span style="font-size:18px;color:#123456">介绍</span></p>' +
    '<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">链接</a>',
  );
  assert.match(html ?? "", /line-height:1.5/);
  assert.match(html ?? "", /font-size:18px/);
  assert.match(html ?? "", /color:#123456/);
  assert.doesNotMatch(html ?? "", /<script|<img|<a|onerror|javascript:/i);
});

test("an intentionally cleared introduction stays empty", () => {
  assert.equal(sanitizeMacroIntroHtml(""), "");
  assert.equal(sanitizeMacroIntroHtml(undefined), undefined);
});
