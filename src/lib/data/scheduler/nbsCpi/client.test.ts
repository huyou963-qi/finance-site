import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import {clearNbsCpiCache,fetchNbsCpiWorkbook} from "./client";

test("CPI monthly release leaving the newest archive page is still discoverable",async()=>{
  clearNbsCpiCache();const original=globalThis.fetch;const requested:string[]=[];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["fixture"]]),"sheet");
  const bytes=XLSX.write(wb,{type:"buffer",bookType:"xlsx"});
  globalThis.fetch=async(input)=>{const url=String(input);requested.push(url);
    if(url.endsWith("index_1.html"))return new Response('<a href="202609/cpi.html">2026年8月份居民消费价格同比上涨0.8%</a>');
    if(url.endsWith("cpi.html"))return new Response('<a href="cpi.xlsx">相关数据表</a>');
    if(url.endsWith("cpi.xlsx"))return new Response(bytes);
    return new Response('<a href="pmi.html">2026年9月采购经理指数</a>');};
  try{const result=await fetchNbsCpiWorkbook({indexUrl:"https://www.stats.gov.cn/sj/zxfbhjd/"});
    assert.match(result.articleUrl,/202609\/cpi.html$/);assert.ok(requested.some(u=>u.endsWith("index_1.html")));
  }finally{globalThis.fetch=original;clearNbsCpiCache();}
});
