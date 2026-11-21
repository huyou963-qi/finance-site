import assert from "node:assert/strict";
import test from "node:test";
import { parseMspdSecurities, maturitySchedule, auctionIssuanceByMonth, persistTreasurySnapshots, persistFiscalRawResult, fiscalRawWindows, type TreasuryRow } from "./raw";
import type { PrismaClient } from "@prisma/client";
import type { FetchIncrementalResult } from "../types";
const row = (cusip:string, amount:string|null, maturity="2027-01-15"):TreasuryRow => ({record_date:"2026-10-31",security_type_desc:"Marketable",security_class1_desc:"Notes",security_class2_desc:cusip,maturity_date:maturity,outstanding_amt:amount});

test("raw persistence bounds each Prisma request to one report and retains duplicate skipping",async()=>{
  const snapshots=Array.from({length:101},(_,i)=>({dataset:"mspd",recordKey:String(i),asOfDate:new Date("2026-10-31"),contentHash:String(i),payload:[row("912828U24","100")],sourceUrl:"https://api.fiscaldata.treasury.gov/"}));
  let calls=0;
  const prisma={treasurySourceSnapshot:{createMany:async(args:{data:typeof snapshots;skipDuplicates:boolean})=>{
    assert.equal(args.data.length,1);assert.equal(args.skipDuplicates,true);
    assert.equal(args.data[0],snapshots[calls++]);return {count:calls===1?0:1};
  }}} as unknown as PrismaClient;
  assert.equal(await persistTreasurySnapshots(prisma,snapshots),100);
  assert.equal(calls,101);
});

test("raw windows cover the requested history without overlap and bound MSPD to one month",()=>{
  assert.deepEqual(fiscalRawWindows("raw:mspd","2026-08-15","2026-10-31"),[
    {start:"2026-08-15",end:"2026-09-01"},{start:"2026-09-01",end:"2026-10-01"},{start:"2026-10-01",end:"2026-11-01"}]);
  assert.equal(fiscalRawWindows("raw:mspd","1950-01-01","2026-10-31").length,310);
  assert.deepEqual(fiscalRawWindows("raw:auctions","2025-06-01","2026-11-21"),[
    {start:"2025-06-01",end:"2026-01-01"},{start:"2026-01-01",end:"2027-01-01"},{start:"2027-01-01",end:"2028-01-01"}]);
  assert.throws(()=>fiscalRawWindows("raw:unknown","2001-01-01","2026-10-31"),/未知/);
});

test("stream persists each window before requesting the next and keeps the latest realized date",async()=>{
  const events:string[]=[];
  const snapshot={dataset:"mspd",recordKey:"2026-10-31",asOfDate:new Date("2026-10-31"),contentHash:"hash",payload:[row("912828U24","100")],sourceUrl:"https://api.fiscaldata.treasury.gov/"};
  async function* batches(){
    events.push("fetch1");yield {snapshots:[snapshot],sourceLatestObsDate:new Date("2026-10-31"),nativeRows:1};
    events.push("fetch2");yield {snapshots:[snapshot],sourceLatestObsDate:null,nativeRows:1};
  }
  const result:FetchIncrementalResult={points:[],sourceLatestObsDate:null,skippedInvalid:0,treasurySnapshotBatches:batches()};
  const prisma={treasurySourceSnapshot:{createMany:async()=>{events.push("persist");return {count:1};}}} as unknown as PrismaClient;
  assert.deepEqual(await persistFiscalRawResult(prisma,result),{inserted:2,fetched:2});
  assert.deepEqual(events,["fetch1","persist","fetch2","persist"]);
  assert.equal(result.sourceLatestObsDate?.toISOString(),"2026-10-31T00:00:00.000Z");
  assert.equal(result.sourceMetadata?.snapshotCount,2);
});

test("stream failures are not reported as successful complete history",async()=>{
  async function* batches(){yield {snapshots:[],sourceLatestObsDate:null,nativeRows:0};throw new Error("source failed");}
  const result:FetchIncrementalResult={points:[],sourceLatestObsDate:null,skippedInvalid:0,treasurySnapshotBatches:batches()};
  await assert.rejects(()=>persistFiscalRawResult({} as PrismaClient,result),/source failed/);
});

test("maturity ladder counts reopening CUSIP total once and excludes matured stock",()=>{
  const rows=[row("912828U24",null),row("912828U24","100"),row("912828U24",null),row("912828U25","50","2026-10-15"),row("Total","100")];
  assert.equal(parseMspdSecurities(rows,"2026-10-31").length,1);
  const schedule=maturitySchedule(rows,"2026-10-31");
  assert.equal(schedule.buckets.find(b=>b.month==="2027-01")?.amountMillions,100);
  assert.equal(schedule.dueSharePercent,100);
});
test("maturity ladder fails closed for missing totals, duplicate totals and mixed months",()=>{
  assert.throws(()=>parseMspdSecurities([row("912828U24",null)],"2026-10-31"),/余额合计/);
  assert.throws(()=>parseMspdSecurities([row("912828U24","100"),row("912828U24","100")],"2026-10-31"),/余额合计/);
  assert.throws(()=>parseMspdSecurities([{...row("912828U24","100"),record_date:"2026-09-30"}],"2026-10-31"),/其他月份/);
});
test("older MSPD reports may publish separate nonempty balances for each reopening tranche",()=>{
  const rows=[{...row("912795H46","20006.4221"),issue_date:"2008-05-01"},
    {...row("912795H46","24020.1673"),issue_date:"2008-07-31"}];
  assert.equal(parseMspdSecurities(rows,"2026-10-31")[0]!.outstandingMillions,44026.5894);
});
test("old inflation-indexed notes and bonds remain TIPS in the maturity ladder",()=>{
  const rows=[{...row("912828U24","100"),security_class1_desc:"Inflation-Indexed Notes"},
    {...row("912828U25","200"),security_class1_desc:"Inflation-Indexed Bonds"}];
  assert.deepEqual(parseMspdSecurities(rows,"2026-10-31").map(r=>r.type),["tips","tips"]);
});
test("legacy auction results retain native amount and TIPS classification",()=>{
  const result=auctionIssuanceByMonth([{issue_date:"2020-10-15",cusip:"legacy",security_type:"Note",inflation_index_security:"Yes",total_accepted:"123"}],"2020-10-31");
  assert.equal(result[0]!.dollars.tips,123);assert.equal(result[0]!.complete,true);
});
test("auction structure preserves TIPS/FRN, excludes future issuance, and never substitutes planned supply",()=>{
  const base={issue_date:"2026-10-15",security_type:"Note",grand_total_par_awarded:"100",offering_amt:"999"};
  const result=auctionIssuanceByMonth([
    {...base,cusip:"tips",inflation_protected:"Yes"}, {...base,cusip:"frn",floating_rate:"Yes"},
    {...base,cusip:"nominal",grand_total_par_awarded:null}, {...base,cusip:"future",issue_date:"2026-11-15"},
  ],"2026-10-31");
  assert.equal(result.length,1); assert.equal(result[0]!.dollars.tips,100);assert.equal(result[0]!.dollars.frn,100);
  assert.equal(result[0]!.dollars.notes,0);assert.equal(result[0]!.complete,false);assert.equal(result[0]!.missingResults,1);
});
