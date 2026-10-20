import assert from "node:assert/strict";
import test from "node:test";
import type { MacroChartTemplate } from "./macroPresetTemplates";
import { sanitizeMacroIntroHtml, templateIntroSnapshot } from "./macroIntroHtml";

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

test("saving a template includes the latest introduction draft and legacy fields", () => {
  const template = {
    description: "概览",
    introText: "旧正文",
    introHtml: "<p>旧富文本</p>",
    chartIntroNotes: { "0": "图表说明" },
  } as unknown as MacroChartTemplate;
  const intro = templateIntroSnapshot(template, '<p style="line-height:1.5">新正文</p><script>x</script>');
  assert.equal(intro.description, "概览");
  assert.equal(intro.introText, "旧正文");
  assert.deepEqual(intro.chartIntroNotes, { "0": "图表说明" });
  assert.match(intro.introHtml ?? "", /新正文/);
  assert.doesNotMatch(intro.introHtml ?? "", /<script/);
  assert.equal(templateIntroSnapshot(template).introHtml, "<p>旧富文本</p>");
});
