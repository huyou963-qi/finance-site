import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fetchMofFiscalHistory, parseMofFiscalArticleList } from "./client";
import { fetchMofFiscalIncremental } from "../adapters/mofFiscalAdapter";
import { MOF_FISCAL_INDEX_URL } from "./catalog";

test("directory change and off-origin article links fail loudly", () => {
  assert.throws(() => parseMofFiscalArticleList("<html>no archive</html>",MOF_FISCAL_INDEX_URL), /缺少/);
  assert.throws(() => parseMofFiscalArticleList('<a href="https://invalid.example/x">2026年财政收支情况</a>',MOF_FISCAL_INDEX_URL), /非官方/);
});
test("worker range is bounded, snapshots coalesce, failures retry, source latest survives filtering, empty DB bootstraps", async () => {
  const original = globalThis.fetch;
  const originalNow = Date.now;
  const originalProxy = process.env.CHINA_OFFICIAL_PROXY_URL;
  delete process.env.CHINA_OFFICIAL_PROXY_URL;
  const originalBypass = process.env.MOF_FISCAL_BYPASS_CACHE;
  process.env.MOF_FISCAL_BYPASS_CACHE = "1";
  const calls: string[] = [];
  let reject2024 = true;
  let corrupt2026 = false;
  const source = readFileSync(new URL("./fixtures/2026-08.html",import.meta.url),"utf8");
  globalThis.fetch = async (input) => {
    const url = String(input); calls.push(url);
    if (url === MOF_FISCAL_INDEX_URL) return new Response([2026,2025,2024,2023].map(year => `<a href="./${year}.htm">${year}年1-8月财政收支情况</a>`).join(""));
    if (url.endsWith("index_1.htm")) return new Response('<a href="./2015.htm">2015年1-8月财政收支情况</a><a href="./2014.htm">2014年财政收支情况</a>');
    const year = Number(/\/(20\d{2})\.htm$/.exec(url)?.[1]);
    if (year === 2026 && corrupt2026) return new Response("<h1>2026年1-8月财政收支情况</h1><p>结构已变，无金额锚点</p>");
    if (year === 2024 && reject2024) return new Response("upstream failed",{status:503});
    if (!year) throw new Error(`unexpected URL ${url}`);
    return new Response(source.replaceAll("2026",String(year)));
  };
  try {
    const [a,b] = await Promise.all([fetchMofFiscalHistory(2025),fetchMofFiscalHistory(2025)]);
    assert.equal(a,b);
    assert.equal(calls.length,3);
    assert.equal(a.get("general_revenue")?.get("amount")?.length,2);
    await assert.rejects(fetchMofFiscalHistory(2024), /503/);
    // Every member must fail, while even different history windows share the
    // one rejected URL request during the snapshot cooldown.
    const failedMembers=await Promise.allSettled(Array.from({length:88},(_,index)=>fetchMofFiscalIncremental({scrape:{component:"general_revenue",measure:"amount"}},"mof_cn_fiscal_general_revenue_amount",index%2 ? "2024-01-01" : "2023-01-01")));
    assert.equal(failedMembers.every(item=>item.status==='rejected'),true);
    assert.equal(calls.filter(url=>url.endsWith('2024.htm')).length,1);
    reject2024 = false;
    await assert.rejects(fetchMofFiscalHistory(2024),/503/);
    Date.now=()=>originalNow()+16*60_000;
    const repaired = await fetchMofFiscalHistory(2024);
    assert.equal(repaired.get("general_revenue")?.get("amount")?.length,3);
    assert.equal(calls.filter(url => url.endsWith("2024.htm")).length,2);
    const filtered = await fetchMofFiscalIncremental({scrape:{component:"general_revenue",measure:"amount"}},"mof_cn_fiscal_general_revenue_amount","2026-09-01");
    assert.equal(filtered.points.length,0);
    assert.equal(filtered.sourceLatestObsDate?.toISOString().slice(0,10),"2026-08-01");
    const bootstrap = await fetchMofFiscalHistory(1950);
    assert.equal(bootstrap.get("general_revenue")?.get("amount")?.[0]?.obsDate.getUTCFullYear(),2015);
    assert.equal(calls.filter(url=>url.endsWith("index_1.htm")).length,2);
    corrupt2026=true;
    Date.now=()=>originalNow()+32*60_000;
    const beforeCorrupt=calls.filter(url=>url.endsWith('2026.htm')).length;
    const malformedMembers=await Promise.allSettled(Array.from({length:88},(_,index)=>fetchMofFiscalIncremental({scrape:{component:"general_revenue",measure:"amount"}},"mof_cn_fiscal_general_revenue_amount",index%2 ? "2022-01-01" : "2021-01-01")));
    assert.equal(malformedMembers.every(item=>item.status==='rejected' && /结构解析失败/.test(String(item.reason))),true);
    assert.equal(calls.filter(url=>url.endsWith('2026.htm')).length-beforeCorrupt,1);
    corrupt2026=false;
    Date.now=()=>originalNow()+48*60_000;
    const structurallyRepaired=await fetchMofFiscalHistory(2022);
    assert.equal(structurallyRepaired.get('general_revenue')?.get('amount')?.at(-1)?.obsDate.getUTCFullYear(),2026);
    assert.equal(calls.filter(url=>url.endsWith('2026.htm')).length-beforeCorrupt,2);
  } finally {
    globalThis.fetch = original;
    Date.now = originalNow;
    if (originalBypass === undefined) delete process.env.MOF_FISCAL_BYPASS_CACHE; else process.env.MOF_FISCAL_BYPASS_CACHE = originalBypass;
    if (originalProxy !== undefined) process.env.CHINA_OFFICIAL_PROXY_URL = originalProxy;
  }
});
