import assert from "node:assert/strict";
import test from "node:test";
import { parseTradingEconomicsCaixinPmiPage } from "./parseCaixinPmiPage";

// 内联片段，取自 TE china/manufacturing-pmi 真实页面（2026-09 实测）的
// #description 叙述段结构；不读取本地 .data/ fixture（tests/architecture 的
// repository-guards 禁止测试依赖被 gitignore 的机器本地文件）。
function descriptionHtml(sentence: string): string {
  return `<div id="description" style="line-height: 1.45em;">${sentence}<span class='source-present'>source: <a class='source-name' target='_blank' href='https://www.pmi.spglobal.com/public'>S&amp;P Global</a></span></h2></div>`;
}

test("parses headline from RatingDog-branded narrative (to-verb pattern)", () => {
  const html = descriptionHtml(
    "The RatingDog China Manufacturing PMI increased to 51.5 in August 2026 from July's four-month low of 50.9, surpassing forecasts of 51.",
  );
  const parsed = parseTradingEconomicsCaixinPmiPage(html);
  assert.equal(parsed.headline.value, 51.5);
  assert.equal(parsed.headline.referenceText, "August 2026");
  assert.equal(parsed.headline.obsDate.toISOString(), "2026-08-01T00:00:00.000Z");
});

test("parses headline from Caixin-branded narrative (at-verb pattern)", () => {
  const html = descriptionHtml(
    "The Caixin China Manufacturing PMI remained unchanged at 50.2 in March 2025.",
  );
  const parsed = parseTradingEconomicsCaixinPmiPage(html);
  assert.equal(parsed.headline.value, 50.2);
  assert.equal(parsed.headline.referenceText, "March 2025");
});

test("throws when #description anchor is missing", () => {
  assert.throws(() => parseTradingEconomicsCaixinPmiPage("<html><body>no anchor</body></html>"));
});

test("throws when narrative sentence does not match expected verb pattern", () => {
  const html = descriptionHtml("China Manufacturing PMI is somewhere in August 2026.");
  assert.throws(() => parseTradingEconomicsCaixinPmiPage(html));
});
