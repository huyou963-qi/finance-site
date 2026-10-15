import assert from "node:assert/strict";
import test from "node:test";
import { parseGaccUsdMonthlySummary } from "./gaccTotals";
import { parseGaccMonthlyTableIndex } from "../gaccCommodity/parseMonthlyIndex";
import { fetchMofcomTradeHistory, usesGaccTotalAmounts } from "./client";
import { mofcomRevisionPoints } from "../adapters/mofcomTradeAdapter";
const table='<table><tr><td>1.Summary of Imports and Exports (In USD) B：Monthly</td></tr><tr><td>Unit:US$ million</td></tr><tr><td>Year&amp;Month</td><td>Total</td><td>Export</td><td>Import</td><td>Balance</td><td>1to8</td></tr><tr><td>2026.01</td><td>593,108</td><td>356,557</td><td>236,551</td><td>120,006</td><td>593,108</td><td>356,557</td><td>236,551</td><td>120,006</td></tr></table>';
test("USD monthly primary table—not annual/RMB—exposes Jan revised amounts without deriving growth",()=>{
  const p=parseGaccUsdMonthlySummary(table);
  assert.equal(p.find(p=>p.key==='total|import|amount')?.point.value,2365.51);
  assert.equal(p.find(p=>p.key==='total|total|cumulative_amount')?.point.value,5931.08);
  assert.ok(!p.some(p=>p.key.includes('yoy')));
  assert.throws(()=>parseGaccUsdMonthlySummary(table.replace('US$ million','RMB million')),/unit/);
  assert.throws(()=>parseGaccUsdMonthlySummary(table.replace('236,551','…')),/numeric/);
  const links=parseGaccMonthlyTableIndex('<table><tr><td>（1）Summary of Imports and Exports (In USD) A：Annually</td><td><a href=http://english.customs.gov.cn/annual.html>Aug.</a></td></tr><tr><td>（1）Summary of Imports and Exports (In USD) B：Monthly</td><td><a href=http://english.customs.gov.cn/month.html>Aug.</a><span>Sep.</span></td></tr></table>',{no:1,keyword:'summary',titlePattern:/\(in usd\).*b[：:]?\s*monthly/i});
  assert.deepEqual(links,[{month:8,url:'http://english.customs.gov.cn/month.html'}]);
});
test("mirror revision is replaced by source levels and survives worker lookback, growth stays as published",async()=>{
  const out=await fetchMofcomTradeHistory({fetchGaccTotals:async()=>parseGaccUsdMonthlySummary(table),fetchJson:async path=>{
    if(path==='totalmonth/query')return [[{trade_date:'202601',total_value:5907.59,total_lj_value:5907.59,import_value:2340.59,import_lj_value:2340.59,import_per:8.8},{trade_date:'202608',total_value:6837.97,total_lj_value:50421.72,import_value:2823.56,import_lj_value:21183.33}]];
    if(path==='totaltrademethod/query')return [[{trade_date:'202608',type:'一般贸易',import_value:1}]];
    return {rows:[{trade_date:'202608',type:'加拿大',import_lj_value:1}]};
  }});
  const series=[...out.values()].find(s=>s.key==='total|import|amount')!;
  assert.equal(series.points[0]?.value,2365.51);
  assert.ok(mofcomRevisionPoints(series,'2026-05-01').some(p=>p.obsDate.toISOString().startsWith('2026-01')));
  const growth=[...out.values()].find(s=>s.key==='total|import|yoy')!;
  assert.equal(growth.points[0]?.value,8.8);
  assert.equal(mofcomRevisionPoints(growth,'2026-05-01').length,0);
  assert.equal(usesGaccTotalAmounts(series.code),true);
  assert.equal(usesGaccTotalAmounts(growth.code),false);
  assert.equal(usesGaccTotalAmounts('unknown'),false);
});
test("unrelated country/method/growth members do not depend on primary totals availability", async () => {
  let primaryCalls = 0;
  const history = await fetchMofcomTradeHistory({ includePrimaryTotals: false,
    fetchGaccTotals: async () => { primaryCalls++; throw new Error("primary unavailable"); },
    fetchJson: async path => path === 'totalmonth/query'
      ? [[{trade_date:'202608',total_value:6837.97,import_value:2823.56,import_per:8.8}]]
      : path === 'totaltrademethod/query'
        ? [[{trade_date:'202608',type:'一般贸易',import_value:1}]]
        : {rows:[{trade_date:'202608',type:'加拿大',import_lj_value:1}]},
  });
  assert.equal(primaryCalls, 0);
  assert.ok([...history.values()].some(series => series.key === 'country|加拿大|import|cumulative_amount'));
});
