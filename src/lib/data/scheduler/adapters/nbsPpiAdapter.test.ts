import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { fetchNbsPpiIncremental } from "./nbsPpiAdapter";
import { clearPriceWorkbookCache } from "../nbsPriceRelease/client";

const workbook = () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["2026年9月工业生产者价格主要数据"], [null,"环比涨跌幅（%）","同比涨跌幅（%）","1—9月同比"],
    ["一、工业生产者出厂价格",1.2,5,2.3], ["生产资料",1.4,6.5,3.3], ["生活资料",.1,-.1,-1],
    ["二、工业生产者购进价格",1.2,6.9,3.6], ["三、主要行业出厂价格"],
    ["农副食品加工业",.5,-.9,-1.4], ["酒、饮料和精制茶制造业",-.1,-5.3,-3.6],
  ]),"Sheet1");return XLSX.write(wb,{type:"buffer",bookType:"xlsx"});
};
test("PPI official release closes JSON publication lag; missing industries do not consume the release", async t => {
  const original=globalThis.fetch;clearPriceWorkbookCache();let period="202608MM",value="98.3",fileReads=0;
  globalThis.fetch=async input=>{
    const url=String(input);
    if(url.includes("/stream/esData"))return Response.json({data:[{code:period,values:[{_id:"id",value}]}]});
    if(url.endsWith("ppi.xlsx")){fileReads++;return new Response(workbook());}
    if(url.endsWith("ppi.html"))return new Response('<a href="ppi.xlsx">相关数据表</a>');
    if(url.endsWith("index_1.html"))return new Response('<a href="202610/ppi.html">2026年9月份工业生产者出厂价格同比上涨5.0%</a>');
    return new Response('<a href="cpi.html">2026年9月份居民消费价格同比上涨0.9%</a>');
  };
  const meta={scrape:{cid:"cid",indicatorId:"id",sourceMeasure:"index"}};
  try {
    await t.test("August JSON plus September release yields September, preserving history",async()=>{
      const r=await fetchNbsPpiIncremental(meta,"nbs_cn_ppi_agri_food_yoy","2026-07-01");
      assert.equal(r.sourceLatestObsDate?.toISOString(),"2026-09-01T00:00:00.000Z");
      assert.equal(r.points.at(-1)?.value,-.9);assert.equal(r.points.length,2);
    });
    await t.test("unpublished member waits for same-period JSON rather than SKIPPED",async()=>{
      await assert.rejects(fetchNbsPpiIncremental(meta,"nbs_cn_ppi_leather_yoy","2026-07-01"),/尚未补齐/);
    });
    await t.test("same-period JSON revision wins over first-release file",async()=>{
      period="202609MM";value="98.8";
      const r=await fetchNbsPpiIncremental(meta,"nbs_cn_ppi_agri_food_yoy","2026-07-01");
      assert.equal(r.points.length,1);assert.equal(r.points[0]?.value,-1.2);
      const omitted=await fetchNbsPpiIncremental(meta,"nbs_cn_ppi_leather_yoy","2026-07-01");
      assert.equal(omitted.sourceLatestObsDate?.toISOString(),"2026-09-01T00:00:00.000Z");
      assert.equal(fileReads,1);
    });
  } finally {globalThis.fetch=original;clearPriceWorkbookCache();}
});
