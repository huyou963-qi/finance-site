import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { collectSafeExternalHistory, parseSafeExternalSheet, pickAttachmentUrls, SafePageUnavailableError, SafeSourceChangedError, translateSettlementEnglishRows, type SafeLoaders } from "./client";
import { SAFE_DATASETS } from "./catalog";

test("parses SAFE workbook rows and preserves monthly official values", () => {
  const sheet = XLSX.utils.aoa_to_sheet([["银行结售汇（以人民币计价）"], ["单位：亿元人民币"], ["项目", 45292, 45323], ["一、结汇", 18889, 19001]]);
  const series = parseSafeExternalSheet({ key: "settlement", label: "银行结售汇", category: "外汇收支与跨境资金", pages: [] }, "以人民币计价（月度）", sheet);
  assert.equal(series.length, 1); assert.equal(series[0]?.unit, "亿元人民币"); assert.equal(series[0]?.freqLabel, "月"); assert.deepEqual(series[0]?.points.map((point) => [point.obsDate.toISOString().slice(0, 10), point.value]), [["2024-01-01", 18889], ["2024-02-01", 19001]]);
});

test("keeps official reserve USD and SDR columns as separate series", () => {
  const sheet = XLSX.utils.aoa_to_sheet([["官方储备资产"], [null, null, null, null, null], ["项目", 2026.01, null, 2026.02, null], [null, "亿美元", "亿SDR", "亿美元", "亿SDR"], ["1. 外汇储备", "33990.78", "24597.67", "34278.07", "24933.77"], ["4. 黄金", "3695.82", "2674.51", "3875.88", "2819.30"]]);
  const series = parseSafeExternalSheet({ key: "reserve", label: "官方储备资产", category: "外汇储备与黄金", pages: [] }, "Sheet1", sheet);
  assert.equal(series.length, 4); assert.equal(series.find((item) => item.label.endsWith("外汇储备") && item.unit === "亿美元")?.points[0]?.value, 33990.78); assert.equal(series.find((item) => item.label.endsWith("黄金") && item.unit === "亿SDR")?.points[1]?.value, 2819.3);
});

test("parses SAFE quarterly BOP headers and assigns stable canonical codes", () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["中国国际收支平衡表（季度表）"],
    ["单位:亿美元"],
    ["项目", "2025Q1", "2025Q2", "2025Q3", "2025Q4"],
    ["1. 经常账户", 100, 120, 130, 140],
    ["   1.A.a 货物", 200, 210, 220, 230],
    ["   1.A.b 服务", -80, -75, -70, -65],
    ["2.2.1.1 直接投资", 10, -20, 30, -40],
    ["2.2.1.2证券投资", -50, -60, -70, -80],
    ["2.2.1.4其他投资", 90, 80, 70, 60],
  ]);
  const series = parseSafeExternalSheet({ key: "bop", label: "国际收支平衡表", category: "国际收支与对外头寸", pages: [] }, "季度BOP（美元）", sheet);
  assert.equal(series.length, 6);
  assert.deepEqual(series.map((item) => item.code), [
    "safe_cn_bop_current_account",
    "safe_cn_bop_goods_balance",
    "safe_cn_bop_services_balance",
    "safe_cn_bop_direct_investment_net",
    "safe_cn_bop_portfolio_investment_net",
    "safe_cn_bop_other_investment_net",
  ]);
  assert.equal(series[0]?.freqLabel, "季");
  assert.deepEqual(series[0]?.points.map((point) => point.obsDate.toISOString().slice(0, 10)), ["2025-03-01", "2025-06-01", "2025-09-01", "2025-12-01"]);
});

test("skips datasets whose official page was withdrawn without dropping the others", async () => {
  const settlement = SAFE_DATASETS.find((dataset) => dataset.key === "settlement")!;
  const debt = SAFE_DATASETS.find((dataset) => dataset.key === "debt")!;
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["单位：亿美元"], ["项目", 2024, 2025], ["外债余额", 24000, 24500]]), "Sheet1");
  const loaders = (pageError: Error): SafeLoaders => ({
    attachmentUrls: async (page) => { if (settlement.pages.includes(page)) throw pageError; return [`${page}.xlsx`]; },
    workbook: async () => book,
  });
  const withdrawn = new SafePageUnavailableError(settlement.pages[0]!, 404);

  const result = await collectSafeExternalHistory([settlement, debt], { skipUnavailable: true }, loaders(withdrawn));
  assert.deepEqual(result.unavailable.map((item) => item.dataset), ["settlement"]);
  assert.ok(result.history.size > 0);
  assert.ok([...result.history.values()].every((series) => series.dataset === "debt"));

  await assert.rejects(collectSafeExternalHistory([settlement, debt], { skipUnavailable: false }, loaders(withdrawn)), SafePageUnavailableError);
  await assert.rejects(collectSafeExternalHistory([settlement, debt], { skipUnavailable: true }, loaders(new Error("外管局页面 HTTP 503"))), /HTTP 503/);
  await assert.rejects(collectSafeExternalHistory([settlement], { skipUnavailable: true }, loaders(withdrawn)), /未解析出任何时间序列/);
});

const SETTLEMENT_FLOW = [["(I) by banks for themselves", "(一）银行自身"], ["(II) by banks for customers", "(二）银行代客"], ["1. Current Account", "1.经常项目"], ["   1.1 Trade in goods", "1.1货物贸易"], ["   1.2. Trade in services", "1.2服务贸易"], ["   1.3 Income and current transfer", "1.3收益和经常转移"], ["2. Capital and Financial Account", "2.资本与金融项目"], ["Including: Direct investment", "其中: 直接投资"], ["       Portfolio investment", "证券投资"]];
const SETTLEMENT_ROWS: [string, string][] = [
  ["I. Foreign exchange settlement", "一、结汇"], ...SETTLEMENT_FLOW as [string, string][], ["II. Foreign exchange sales", "二、售汇"], ...SETTLEMENT_FLOW as [string, string][], ["III. Balance", "三、差额"], ...SETTLEMENT_FLOW as [string, string][],
  ["IV. Newly Signed Contract Amount of Forward Foreign Exchange Settlement and Sales", "四、远期结售汇签约额"], ["V. Unwind Amount of Forward Foreign Exchange Settlement and Sales", "五、远期结售汇平仓额"],
  ["VI. Rolling Amount of Forward Foreign Exchange Settlement and Sales", "六、远期结售汇展期额"], ["VII. Outstanding Amount of Forward Foreign Exchange Settlement and Sales by the End of the Current Period", "七、本期末远期结售汇累计未到期额"],
  ["VIII. Net Delta Exposure of Outstanding Options", "八、未到期期权Delta净敞口"],
];

test("English settlement workbook yields the same series codes and values as the withdrawn Chinese table", () => {
  const settlementEn = SAFE_DATASETS.find((dataset) => dataset.key === "settlement")!;
  const settlementCn = { key: "settlement" as const, label: "银行结售汇", category: "外汇收支与跨境资金", pages: [] };
  const values = SETTLEMENT_ROWS.map((_, index) => [1000 + index, index === 34 ? "-" : 2000 + index]);
  const en = XLSX.utils.aoa_to_sheet([["Monthly Data on Foreign Exchange Settlement and Sales by Banks (in USD)"], ["Unit: USD 100 million"], ["Item", null, 45292, 45323], ...SETTLEMENT_ROWS.map(([label], index) => [label, index === 30 ? "Foreign exchange settlement" : null, ...values[index]!]), [null, "Foreign exchange sales", 1, 2]]);
  const cn = XLSX.utils.aoa_to_sheet([["银行结售汇（以美元计价）"], ["单位：亿美元"], ["项目", null, 45292, 45323], ...SETTLEMENT_ROWS.map(([, label], index) => [label, index === 30 ? "结汇" : null, ...values[index]!]), [null, "售汇", 1, 2]]);
  const fromEn = parseSafeExternalSheet(settlementEn, "in USD (Monthly)", en);
  const fromCn = parseSafeExternalSheet(settlementCn, "以美元计价（月度）", cn);
  assert.equal(fromEn.length, 35);
  assert.deepEqual(fromEn.map((series) => [series.code, series.key, series.label, series.unit, series.points]), fromCn.map((series) => [series.code, series.key, series.label, series.unit, series.points]));
  assert.ok(fromEn.some((series) => series.key === "settlement|以美元计价（月度）|三、差额|1|亿美元"));
});

test("English settlement translation fails closed on sheet, unit or row drift", () => {
  const rows = (labels: string[], unit = "Unit: RMB 100 million"): unknown[][] => [[unit], ["Item", null, 2024, 2025], ...labels.map((label) => [label, null, 1, 2])];
  const labels = SETTLEMENT_ROWS.map(([label]) => label);
  assert.equal(translateSettlementEnglishRows("in RMB (Annual)", rows(labels)).sheetName, "以人民币计价（年度）");
  assert.throws(() => translateSettlementEnglishRows("in EUR (Annual)", rows(labels)), SafeSourceChangedError);
  assert.throws(() => translateSettlementEnglishRows("in RMB (Annual)", rows(labels, "Unit: RMB 10 thousand")), SafeSourceChangedError);
  assert.throws(() => translateSettlementEnglishRows("in RMB (Annual)", rows(labels.slice(0, 34))), SafeSourceChangedError);
  assert.throws(() => translateSettlementEnglishRows("in RMB (Annual)", rows(labels.map((label, index) => (index === 3 ? "1. Current Accounts" : label)))), /第 4 行/);
});

test("picks only the time-series workbook from the English settlement page", () => {
  const page = "https://www.safe.gov.cn/en/2023/0215/2048.html";
  const html = `<a href="/en/file/file/20260817/a.xlsx" title="Time-series Data of Foreign Exchange Settlement and Sales by Banks.xlsx">Time-series Data</a>
    <a href="/en/file/file/20260817/b.xlsx" title="Data on Foreign Exchange Settlement and Sales by Banks in 2026 (by Region).xlsx">2026 (by Region)</a>`;
  const filter = SAFE_DATASETS.find((dataset) => dataset.key === "settlement")!.attachmentTitle;
  assert.deepEqual(pickAttachmentUrls(html, page, filter), ["https://www.safe.gov.cn/en/file/file/20260817/a.xlsx"]);
  assert.equal(pickAttachmentUrls(html, page).length, 2);
  assert.throws(() => pickAttachmentUrls(html.replace(/Time-series/g, "Series"), page, filter), SafeSourceChangedError);
});

test("tolerant collection also skips a dataset whose source layout changed", async () => {
  const settlement = SAFE_DATASETS.find((dataset) => dataset.key === "settlement")!;
  const debt = SAFE_DATASETS.find((dataset) => dataset.key === "debt")!;
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["单位：亿美元"], ["项目", 2024, 2025], ["外债余额", 24000, 24500]]), "Sheet1");
  const loaders: SafeLoaders = { attachmentUrls: async (page, dataset) => { if (dataset.key === "settlement") throw new SafeSourceChangedError(`changed: ${page}`); return [`${page}.xlsx`]; }, workbook: async () => book };
  const result = await collectSafeExternalHistory([settlement, debt], { skipUnavailable: true }, loaders);
  assert.deepEqual(result.unavailable.map((item) => item.dataset), ["settlement"]);
  await assert.rejects(collectSafeExternalHistory([settlement, debt], { skipUnavailable: false }, loaders), SafeSourceChangedError);
});
