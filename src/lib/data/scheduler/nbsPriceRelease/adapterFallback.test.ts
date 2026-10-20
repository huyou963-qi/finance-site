import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { clearPriceWorkbookCache } from "./client";
import { fetchNbsRetailIncremental } from "../adapters/nbsRetailAdapter";
import { fetchNbsIndustrialIncremental } from "../adapters/nbsIndustrialAdapter";

test("existing worker adapters use official release on API outage and never fabricate an omitted member", async () => {
  const old = globalThis.fetch;
  const workbook = (industrial: boolean) => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      [industrial ? "2026年9月份规模以上工业生产主要数据" : "2026年9月份社会消费品零售总额主要数据"],
      ["指标", "9月", "", "1—9月"], ["", "绝对量", "同比增长", "绝对量", "同比增长"],
      [industrial ? "规模以上工业增加值" : "社会消费品零售总额", "…", 5.5, "…", 5.3],
      [industrial ? "橡胶和塑料制品业" : "金银珠宝类", 258, -9.6, 2620, -2.4],
      ["其他已公布行", 1, 2, 3, 4],
    ]), "表");
    return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
  };
  const md = { displayName: "限上商品零售：金银珠宝类累计值", scrape: { cid: "fixture", indicatorId: "fixture", measure: "yoy" } };
  try {
    clearPriceWorkbookCache();
    globalThis.fetch = async input => {
      const url = String(input);
      if (url.includes("data.stats.gov.cn")) return new Response("outage", { status: 503 });
      if (url.endsWith("/zxfbhjd/")) return new Response('<a href="retail.html">2026年1—9月份社会消费品零售总额增长1.1%</a><a href="industrial.html">2026年9月份规模以上工业增加值增长5.5%</a>');
      if (url.endsWith(".html")) return new Response(`<a href="${url.includes("industrial") ? "industrial" : "retail"}.xlsx">相关数据表</a>`);
      if (url.endsWith(".xlsx")) return new Response(new Uint8Array(workbook(url.includes("industrial"))));
      throw new Error("Unexpected official request");
    };
    const retail = await fetchNbsRetailIncremental(md, "nbs_cn_retail_goods_e43cfafd_cum", "2026-08-01");
    assert.equal(retail.points[0]?.value, 2620);
    assert.equal(retail.sourceLatestObsDate?.toISOString().slice(0, 10), "2026-09-01");
    assert.equal(retail.sourceMetadata?.releaseSupplementUsed, true);
    const industry = await fetchNbsIndustrialIncremental(md, "nbs_cn_industrial_rubber_plastic_yoy", "2026-08-01");
    assert.equal(industry.points[0]?.value, -9.6);
    assert.equal(industry.sourceMetadata?.nativeApiUnavailable, true);
    await assert.rejects(fetchNbsIndustrialIncremental(md, "nbs_cn_industrial_missing_yoy", "2026-08-01"), /HTTP 503/);
    await assert.rejects(fetchNbsIndustrialIncremental(md, "nbs_cn_industrial_rubber_plastic_yoy", "2026-10-01"), /HTTP 503/);
    await assert.rejects(fetchNbsRetailIncremental({}, "not_registered", "2026-08-01"));
  } finally { globalThis.fetch = old; clearPriceWorkbookCache(); }
});
