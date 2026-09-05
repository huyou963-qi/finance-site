import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parsePrNewswireListPage } from "./parseList";
import { parsePrNewswireReport } from "./parseReport";

const FIX = (name: string) =>
  path.join(__dirname, "..", "fixtures", name);

test("parses the PR Newswire ISM list page into sorted, deduped entries", () => {
  const html = fs.readFileSync(FIX("prnewswire-list.snippet.html"), "utf8");
  const entries = parsePrNewswireListPage(html);

  assert.equal(entries[0]!.kind, "manufacturing");
  assert.equal(entries[0]!.year, 2026);
  assert.equal(entries[0]!.month, 8);
  assert.equal(
    entries[0]!.url,
    "https://www.prnewswire.com/news-releases/manufacturing-pmi-at-54-6-august-2026-ism-manufacturing-pmi-report-302865127.html",
  );

  const svc = entries.filter((e) => e.kind === "services");
  assert.equal(svc.length, 6);
  assert.deepEqual(
    svc.map((e) => `${e.year}-${e.month}`),
    ["2026-8", "2026-7", "2026-6", "2026-5", "2026-1", "2025-8"],
  );

  // 无关链接（非 manufacturing-pmi/services-pmi slug）应被忽略，不进入结果
  assert.ok(!entries.some((e) => e.url.includes("new-board-member")));
});

test("throws when the list page has no PMI candidate links at all", () => {
  assert.throws(
    () => parsePrNewswireListPage("<html><body><a href='/about'>About</a></body></html>"),
    /未找到任何 manufacturing-pmi\/services-pmi 链接/,
  );
});

test("throws when candidate links exist but the slug schema no longer matches", () => {
  const html =
    '<a href="/news-releases/manufacturing-pmi-report-redesigned-302999999.html">Manufacturing PMI</a>';
  assert.throws(
    () => parsePrNewswireListPage(html),
    /均无法解析月份\/年份\/报告类型/,
  );
});

test("parses PR Newswire manufacturing AT A GLANCE table (July 2026)", () => {
  const html = fs.readFileSync(FIX("prnewswire-mfg-july-2026.snippet.html"), "utf8");
  const parsed = parsePrNewswireReport(html, "manufacturing");
  assert.equal(parsed.obsDate.toISOString().slice(0, 10), "2026-07-01");
  assert.equal(parsed.pointsByCode.get("ism_us_ism_headline")?.value, 55.6);
  assert.equal(parsed.pointsByCode.get("ism_us_ism_customers_inventories")?.value, 40.7);
  assert.equal(parsed.pointsByCode.get("ism_us_ism_new_export_orders")?.value, 53.0);
  assert.equal(parsed.pointsByCode.get("ism_us_ism_imports")?.value, 55.7);
  assert.equal(parsed.pointsByCode.size, 11);
});

test("parses PR Newswire manufacturing AT A GLANCE table (August 2026)", () => {
  const html = fs.readFileSync(FIX("prnewswire-mfg-august-2026.snippet.html"), "utf8");
  const parsed = parsePrNewswireReport(html, "manufacturing");
  assert.equal(parsed.obsDate.toISOString().slice(0, 10), "2026-08-01");
  assert.equal(parsed.pointsByCode.get("ism_us_ism_headline")?.value, 54.6);
  assert.equal(parsed.pointsByCode.get("ism_us_ism_customers_inventories")?.value, 42.8);
  assert.equal(parsed.pointsByCode.get("ism_us_ism_new_export_orders")?.value, 53.2);
  assert.equal(parsed.pointsByCode.get("ism_us_ism_imports")?.value, 52.5);
});

test("parses PR Newswire services COMPARISON table using the left (services) column group", () => {
  const html = fs.readFileSync(FIX("prnewswire-svc-july-2026.snippet.html"), "utf8");
  const parsed = parsePrNewswireReport(html, "services");
  assert.equal(parsed.pointsByCode.get("ism_svc_us_svc_headline")?.value, 54.1);
  assert.equal(parsed.pointsByCode.get("ism_svc_us_svc_supplier_deliveries")?.value, 52.8);
  assert.equal(parsed.pointsByCode.get("ism_svc_us_svc_backlog")?.value, 50.9);
  assert.equal(parsed.pointsByCode.get("ism_svc_us_svc_imports")?.value, 51.8);
  assert.equal(parsed.pointsByCode.get("ism_svc_us_svc_inventory_sentiment")?.value, 52.5);
  // 不应该串到右侧制造业对照列的值
  assert.notEqual(parsed.pointsByCode.get("ism_svc_us_svc_headline")?.value, 55.6);
});

test("parses PR Newswire services COMPARISON table (August 2026), including previously-uncovered components", () => {
  const html = fs.readFileSync(FIX("prnewswire-svc-august-2026.snippet.html"), "utf8");
  const parsed = parsePrNewswireReport(html, "services");
  assert.equal(parsed.pointsByCode.get("ism_svc_us_svc_headline")?.value, 55.4);
  assert.equal(parsed.pointsByCode.get("ism_svc_us_svc_supplier_deliveries")?.value, 51.3);
  assert.equal(parsed.pointsByCode.get("ism_svc_us_svc_inventories")?.value, 56.7);
  assert.equal(parsed.pointsByCode.get("ism_svc_us_svc_backlog")?.value, 55.6);
  assert.equal(parsed.pointsByCode.get("ism_svc_us_svc_imports")?.value, 56.3);
  assert.equal(parsed.pointsByCode.get("ism_svc_us_svc_inventory_sentiment")?.value, 54.1);
});

test("falls back to flattened tab/newline text extraction when no <table> anchor is present", () => {
  const html = fs.readFileSync(FIX("prnewswire-mfg-flattext-variant.snippet.html"), "utf8");
  const parsed = parsePrNewswireReport(html, "manufacturing");
  assert.equal(parsed.pointsByCode.get("ism_us_ism_headline")?.value, 54.6);
  assert.equal(parsed.pointsByCode.get("ism_us_ism_new_orders")?.value, 53.7);
  assert.equal(parsed.pointsByCode.get("ism_us_ism_customers_inventories")?.value, 42.8);
  assert.equal(parsed.pointsByCode.get("ism_us_ism_imports")?.value, 52.5);
});

test("throws when neither a scoring <table> nor a scoring flattened-text block is found", () => {
  assert.throws(
    () => parsePrNewswireReport("<h1>August 2026 ISM® Report</h1><p>hello</p>", "manufacturing"),
    /未找到 AT A GLANCE 表/,
  );
});

test("throws on out-of-range component value instead of silently accepting it", () => {
  const html = `
    <h1>Manufacturing PMI® at 154.6%; August 2026 ISM® Manufacturing PMI® Report</h1>
    <table>
      <tr><td>Manufacturing PMI®</td><td>154.6</td><td>55.6</td></tr>
      <tr><td>New Orders</td><td>53.7</td><td>56.7</td></tr>
    </table>`;
  assert.throws(() => parsePrNewswireReport(html, "manufacturing"), /超出 \[0,100\]/);
});

test("throws when the title month cannot be parsed", () => {
  assert.throws(
    () => parsePrNewswireReport("<table><tr><td>Manufacturing PMI®</td><td>54.6</td></tr></table>", "manufacturing"),
    /无法从标题解析观测月份/,
  );
});
