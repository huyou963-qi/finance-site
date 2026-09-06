import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateOwnershipMonitor, disclosedAccount, resolveEconomicTransactions, type OwnershipEngineInput } from "./ownershipEngine";
import type { InsiderTransactionRow } from "./insiderTransactions";
import type { OwnershipReviewFact, ReviewPayload, TradingPlan } from "./ownershipTypes";
const owner={cik:"0002",name:"Jane Doe",isOfficer:true,isDirector:false,isTenPercentOwner:false,title:"CEO"};
const row:InsiderTransactionRow={id:"a",cik:"1",accession:"original",filerCik:"0002",filerName:"Jane Doe",isOfficer:true,isDirector:false,isTenPercentOwner:false,officerTitle:"CEO",transactionDate:"2026-08-01",filedAt:"2026-08-03",transactionCode:"S",acquiredDisposedCode:"D",shares:100,pricePerShare:10,sharesOwnedAfter:900,lineIndex:0,evidence:{version:2,security:"Common Stock",ownership:"D",nature:null,owners:[owner],footnotes:[],footnoteIds:[],documentType:"4",originalSubmissionDate:null,lineIndex:0,formPlan:false,plan:null,planAdoptionDate:null,derivative:false,underlyingShares:null,underlyingSecurity:null}};
function review(payload:ReviewPayload,key="test",availableAt="2026-08-03"):OwnershipReviewFact{return{id:key,key,revision:1,payload,sourceUrl:"https://www.sec.gov/test",quote:"Documented evidence for this test.",availableAt,createdAt:"2026-09-05T00:00:00Z"};}
const base:OwnershipEngineInput={rows:[row],reviews:[],holdings:[],plans:[],asOf:"2026-09-05",from:"2026-01-01",splits:[],coverage:{since:"2026-01-01",through:"2026-09-05",checkedAt:"2026-09-05",complete:true,discovered:1,parsed:1,failed:0},market:{adv20:1000,latest:"2026-09-04",issue:null}};
test("同一联合申报只产生一个经济交易，实际基金脚注优先于投资顾问",()=>{
 const joint={...row,evidence:{...row.evidence!,ownership:"I" as const,owners:[owner,{...owner,cik:"3"}],footnotes:["These securities are held directly by Alpha Fund, LP."]}};
 const r=resolveEconomicTransactions([joint],[],base.asOf,[]);assert.equal(r.length,1);assert.equal(r[0].account,"entity:alpha fund lp");assert.equal(r[0].status,"included");
 assert.equal(disclosedAccount("I",[owner],["Investment adviser to Alpha Fund and Beta Fund."]),null);
});
test("名称标点和明确DBA不产生平行持仓账户",()=>{
 assert.equal(disclosedAccount("I",[owner],["These securities are held directly by Alpha Fund LP."]),disclosedAccount("I",[owner],["These securities are held directly by Alpha Fund, LP DBA Alpha Onshore. They are not separate legal entities."]));
});
test("同值不能自动合并；已核实的不同直接账户独立计入",()=>{
 const other={...row,id:"b",accession:"other"};
 assert.ok(resolveEconomicTransactions([row,other],[],base.asOf,[]).every(r=>r.status==="pending"));
 const distinct={...other,evidence:{...row.evidence!,owners:[{...owner,cik:"3"}]}};
 assert.ok(resolveEconomicTransactions([row,distinct],[],base.asOf,[]).every(r=>r.status==="included"));
});
test("审核合并保留原始行，只计算一次",()=>{
 const r=resolveEconomicTransactions([row,{...row,id:"b",accession:"other"}],[review({kind:"transaction",lineIds:["a","b"],action:"merge",canonicalId:"a"})],base.asOf,[]);
 assert.deepEqual(r.map(t=>t.status),["included","duplicate"]);assert.equal(r[1].economicId,"a");
});
test("未来申报和未来裁定不进入历史窗口",()=>{
 const r=resolveEconomicTransactions([row,{...row,id:"future",filedAt:"2026-09-06"}],[review({kind:"transaction",lineIds:["a"],action:"exclude",canonicalId:null},"future","2026-09-06")],base.asOf,[]);
 assert.equal(r.length,1);assert.equal(r[0].status,"included");
});
test("只有明示整份重述的4/A才自动替换整份原件",()=>{
 const amended={...row,id:"b",accession:"amend",filedAt:"2026-08-05",shares:200,sharesOwnedAfter:800,evidence:{...row.evidence!,documentType:"4/A",originalSubmissionDate:"2026-08-03",remarks:"This Form 4/A amends and restates in its entirety the Form 4 filed on August 3, 2026."}};
 const r=resolveEconomicTransactions([row,amended],[],base.asOf,[]);assert.deepEqual(r.map(t=>t.status),["superseded","included"]);
 const unresolved={...amended,evidence:{...amended.evidence,remarks:"Correction"}};
 assert.ok(resolveEconomicTransactions([row,unresolved],[],base.asOf,[]).every(t=>t.status==="pending"));
});
test("部分更正通过审核仅替换所选行",()=>{
 const amended={...row,id:"b",accession:"amend",filedAt:"2026-08-05",shares:200,sharesOwnedAfter:800,evidence:{...row.evidence!,documentType:"4/A",originalSubmissionDate:"2026-08-03"}};
 const result=calculateOwnershipMonitor({...base,rows:[row,amended],reviews:[review({kind:"transaction",lineIds:["a","b"],action:"replace",canonicalId:"b"},"replace","2026-08-05")]});
 assert.equal(result.supply[0].sells90,200);
});
test("供给比例、ADV、累计出售和留存率有精确分母",()=>{
 const r=calculateOwnershipMonitor({...base,reviews:[review({kind:"float",security:"Common Stock",date:"2026-08-01",shares:10000})]});
 assert.equal(r.supply[0].supplyRatio90,0.01);assert.equal(r.accounts[0].cumulativeSoldRatio,0.1);assert.equal(r.accounts[0].retentionRatio,0.9);
 // Aug 1 is outside 30 days ending Sep 5.
 assert.equal(r.supply[0].sellingAdv30,0);
});
test("税款、赠予改变持仓但不算出售；买入使净供给可以为负",()=>{
 const tax={...row,transactionCode:"F"};const r=calculateOwnershipMonitor({...base,rows:[tax]});assert.equal(r.supply[0].sells90,0);assert.ok(Math.abs(r.accounts[0].netReductionRatio!-0.1)<1e-10);
 const buy=calculateOwnershipMonitor({...base,rows:[{...row,transactionCode:"P",acquiredDisposedCode:"A",sharesOwnedAfter:1100}]});assert.equal(buy.supply[0].netSells90,-100);
});
test("拆股统一股数基准，禁止把拆股识别为增减持",()=>{
 const split={exDate:"2026-08-15",ratio:2};
 const r=calculateOwnershipMonitor({...base,splits:[split],reviews:[review({kind:"float",security:"Common Stock",date:"2026-08-01",shares:10000})]});
 assert.equal(r.supply[0].sells90,200);assert.equal(r.supply[0].floatShares,20000);assert.equal(r.accounts[0].baseline,2000);assert.equal(r.accounts[0].retentionRatio,0.9);
});
test("缺失覆盖、过期float、未知数量不变成0比例",()=>{
 const r=calculateOwnershipMonitor({...base,coverage:null,reviews:[review({kind:"float",security:"Common Stock",date:"2025-01-01",shares:10000})]});
 assert.equal(r.supply[0].supplyRatio90,null);assert.equal(r.accounts[0].retentionRatio,null);assert.equal(r.supply[0].floatShares,null);
});
test("同日多档交易重复披露期末余额，按整组对账",()=>{
 const r=calculateOwnershipMonitor({...base,rows:[{...row,shares:40},{...row,id:"b",lineIndex:1,shares:60,pricePerShare:11}]});
 assert.equal(r.accounts[0].baseline,1000);assert.equal(r.accounts[0].retentionRatio,0.9);assert.deepEqual(r.accounts[0].issues,[]);
});
test("持仓断链暂停比例而不掩盖观测",()=>{
 const r=calculateOwnershipMonitor({...base,rows:[row,{...row,id:"b",accession:"b",transactionDate:"2026-08-05",sharesOwnedAfter:600}]});
 assert.equal(r.accounts[0].retentionRatio,null);assert.equal(r.accounts[0].current,600);assert.ok(r.accounts[0].issues.some(s=>s.includes("衔接")));
});
const plan:TradingPlan={id:"jane:2026-07-01",ownerName:"Jane Doe",ownerCik:"2",adopted:"2026-07-01",start:"2026-08-01",end:"2026-12-31",terminated:null,maxShares:300,security:"Common Stock",account:"direct:2",status:"adopted",rule10b51:true,conditions:"价格条件",sourceUrl:"https://www.sec.gov/test",filedAt:"2026-07-02",evidence:"SEC plan",verified:true};
test("计划尚未成交也显示上限，关联成交只扣一次",()=>{
 const transaction={...row,evidence:{...row.evidence!,plan:true,planAdoptionDate:"2026-07-01"}};
 const r=calculateOwnershipMonitor({...base,rows:[transaction],plans:[plan]});assert.equal(r.plans[0].linkedExecuted,100);assert.equal(r.plans[0].remainingUpperBound,200);
 const terminated=calculateOwnershipMonitor({...base,rows:[transaction],plans:[{...plan,status:"terminated",terminated:"2026-09-01"}]});assert.equal(terminated.plans[0].remainingUpperBound,0);
});
test("共享计划额度或未归属成交不产生假剩余量",()=>{
 assert.equal(calculateOwnershipMonitor({...base,plans:[{...plan,conditions:"与旧计划共享额度"}]}).plans[0].remainingUpperBound,null);
 const unknown={...row,evidence:{...row.evidence!,formPlan:true}};
 assert.equal(calculateOwnershipMonitor({...base,rows:[unknown],plans:[plan]}).plans[0].remainingUpperBound,null);
});
test("泛称配偶或未命名信托不能成为跨申报人的同一账户",()=>{
 assert.equal(disclosedAccount("I",[owner],["These shares are held directly by the reporting person's spouse."]),null);
 assert.equal(disclosedAccount("I",[owner],["These shares are held directly by a grantor retained annuity trust."]),null);
});
