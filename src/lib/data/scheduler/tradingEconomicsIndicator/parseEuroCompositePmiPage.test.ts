import assert from "node:assert/strict";
import test from "node:test";
import { parseTradingEconomicsEuroCompositePmiPage } from "./parseEuroCompositePmiPage";

// 内联片段，取自 TE euro-area/composite-pmi 真实页面（2026-09 实测）的
// #description 叙述段结构；不读取本地 .data/ fixture（tests/architecture 的
// repository-guards 禁止测试依赖被 gitignore 的机器本地文件）。
function descriptionHtml(sentence: string): string {
  return `<div id="description" style="line-height: 1.45em;">${sentence}<span class='source-present'>source: <a class='source-name' target='_blank' href='https://www.pmi.spglobal.com/public'>S&amp;P Global</a></span></h2></div>`;
}

test("parses headline from narrative (at-verb 'came in at' pattern)", () => {
  const html = descriptionHtml(
    "The S&P Global Eurozone Composite PMI came in at 52.0 in August 2026, broadly in line with the preliminary estimate of 52.1.",
  );
  const parsed = parseTradingEconomicsEuroCompositePmiPage(html);
  assert.equal(parsed.headline.value, 52);
  assert.equal(parsed.headline.referenceText, "August 2026");
  assert.equal(parsed.headline.obsDate.toISOString(), "2026-08-01T00:00:00.000Z");
});

test("parses headline from narrative (to-verb pattern)", () => {
  const html = descriptionHtml(
    "The S&P Global Eurozone Composite PMI rose to 53.4 points in May 2025, beating expectations.",
  );
  const parsed = parseTradingEconomicsEuroCompositePmiPage(html);
  assert.equal(parsed.headline.value, 53.4);
  assert.equal(parsed.headline.referenceText, "May 2025");
});

test("throws when #description anchor is missing", () => {
  assert.throws(() =>
    parseTradingEconomicsEuroCompositePmiPage("<html><body>no anchor</body></html>"),
  );
});

test("throws when narrative sentence does not match expected verb pattern", () => {
  const html = descriptionHtml("Composite PMI is somewhere in August 2026.");
  assert.throws(() => parseTradingEconomicsEuroCompositePmiPage(html));
});
