import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { discoverInboundConsumptionResultPdfs, parseInboundConsumptionSummaryText } from "./parser";

test("parses the JTA nationwide quarterly inbound-travel spending total", () => {
  const text = readFileSync(path.join(__dirname, "fixtures", "inbound-consumption-summary.txt"), "utf8");
  const point = parseInboundConsumptionSummaryText(text);
  assert.equal(point.obsDate.toISOString().slice(0, 10), "2026-04-01");
  assert.equal(point.value, 25_096);
});

test("only discovers official quarterly-result PDFs", () => {
  const urls = discoverInboundConsumptionResultPdfs(`
    <a href="/kankocho/content/a.pdf">4-6月期 調査結果（1次速報）の概要</a>
    <a href="/kankocho/content/b.pdf">4-6月期 都道府県別集計表</a>
    <a href="/kankocho/content/c.xlsx">4-6月期 集計表（1次速報）</a>`, "https://www.mlit.go.jp/kankocho/tokei_hakusyo/gaikokujinshohidoko.html");
  assert.deepEqual(urls, [{ url: "https://www.mlit.go.jp/kankocho/content/a.pdf", label: "4-6月期 調査結果（1次速報）の概要" }]);
});

test("fails closed when the spending total loses its official currency unit", () => {
  assert.throws(
    () => parseInboundConsumptionSummaryText("2026年4-6月期 訪日外国人旅行消費額 25096"),
    /total spending amount/,
  );
});
