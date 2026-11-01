/** Bounded, evidence-based recovery of the 2026-11-01 audit. Dry-run by default.
 * Run under the worker then calendar locks. No observations/vintages are deleted.
 * npx tsx scripts/data-worker/repair-audit-findings.ts --apply
 */
import {loadEnvConfig} from "@next/env";
import {PrismaClient, Prisma} from "@prisma/client";
import fs from "node:fs/promises";
import {SOURCE_ENDED_HIDDEN_CODES} from "../../src/lib/data/retiredIndicators";
import {fetchWorldBankIncremental} from "../../src/lib/data/scheduler/adapters/worldbankAdapter";
import {runDataSubscription} from "../../src/lib/data/scheduler/runSubscription";
loadEnvConfig(process.cwd());
const p=new PrismaClient();
const apply=process.argv.includes("--apply");
async function main(){
 const reportPath=process.argv.find(a=>a.startsWith("--report="))?.slice(9)??".data/audits/macro-before-20261101.json";
 const report=JSON.parse(await fs.readFile(reportPath,"utf8")) as {findings:{instrumentCode:string;code:string}[]};
 const codes=[...new Set(report.findings.map(f=>f.instrumentCode))];
 if(codes.length>150)throw Error("Refusing unbounded recovery");
 const rows=await p.dataSubscription.findMany({where:{instrument:{code:{in:codes}}},include:{source:true,instrument:{select:{id:true,code:true,name:true,metadata:true}},releasePackage:{select:{id:true,releaseTemplate:true,scheduleState:true,nextRunAt:true}}}});
 const backupPath=`.data/audits/freshness-recovery-backup-${Date.now()}.json`;
 const observations=[];
 for(const sub of rows.filter(s=>s.enabled&&s.sourceId!=="worldbank")) {
  observations.push({code:sub.instrument.code,points:await p.macroObservation.findMany({where:{instrumentId:sub.instrumentId},orderBy:{obsDate:"desc"},take:5000})});
 }
 await fs.writeFile(backupPath,JSON.stringify({createdAt:new Date().toISOString(),reportPath,rows,observations},null,2));
 console.log(`backup=${backupPath} apply=${apply}`);
 const results=[];
 for(const sub of rows){
  const code=sub.instrument.code;
  if(sub.sourceId==="worldbank" && SOURCE_ENDED_HIDDEN_CODES.includes(code)){
   try{
    const result=await fetchWorldBankIncremental(sub.sourceSeriesKey!,"1960-01-01",{historyStartYear:1960});
    if(result.points.length)throw Error("Source now has values; must bootstrap instead of hide");
   }catch(error){
    if(!(error instanceof Error)||!error.message.includes("official API error 175"))throw error;
   }
   const count=await p.macroObservation.count({where:{instrumentId:sub.instrumentId}});
   if(count!==0)throw Error(`Expected empty coverage gap: ${code} now has ${count} observations`);
   if(apply) await p.$transaction([
    p.macroCatalogExcludedKey.upsert({where:{catalogKey:`mds:${code}`},create:{catalogKey:`mds:${code}`,deletedBy:"data:repair-audit-findings:source-coverage"},update:{}}),
    p.macroCatalogExcludedKey.upsert({where:{catalogKey:`wb:${sub.sourceSeriesKey}`},create:{catalogKey:`wb:${sub.sourceSeriesKey}`,deletedBy:"data:repair-audit-findings:source-coverage"},update:{}}),
    p.dataSubscription.update({where:{id:sub.id},data:{enabled:false,nextRunAt:null}}),
    p.scheduleAuditEvent.create({data:{subscriptionId:sub.id,source:"catalog_seed",reason:"official_wdi_no_published_values_20261101",previousNextRunAt:sub.nextRunAt,nextRunAt:null,metadata:{sourceSeriesKey:sub.sourceSeriesKey,observationsPreserved:true}}}),
   ]);
   console.log(`coverage_unavailable ${code}`);results.push({code,status:"coverage_unavailable"});continue;
  }
  if(!sub.enabled)continue;
  const historical=code==="sched_fred_IEASAD";
  if(!historical && !report.findings.some(f=>f.instrumentCode===code&&["fetch_error","bookkeeping_drift"].includes(f.code)))continue;
  if(!apply){console.log(`would_sync ${code}`);continue;}
  // Force only the listed member, use normal writer/vintage logging, retain package schedule.
  const result=await runDataSubscription(p,sub,{force:true,preserveNextRunAt:true,skipCalendarRefresh:true});
  if(historical&&result.status!=="failed"){
   const latest=await p.macroObservation.findFirst({where:{instrumentId:sub.instrumentId},orderBy:{obsDate:"desc"},select:{obsDate:true}});
   if(latest?.obsDate.toISOString().slice(0,10)!=="2019-10-01")throw Error("IEASAD historical endpoint changed; refusing archive");
   await p.$transaction([
    p.instrument.update({where:{id:sub.instrumentId},data:{metadata:{...(sub.instrument.metadata as Prisma.JsonObject),historicalOnly:true,archiveAfterBootstrap:true,officialLastPeriod:"2019-10-01"}}}),
    p.dataSubscription.update({where:{id:sub.id},data:{enabled:false,nextRunAt:null}}),
    p.scheduleAuditEvent.create({data:{subscriptionId:sub.id,source:"catalog_seed",reason:"fred_IEASAD_history_bootstrapped_ended_2019",previousNextRunAt:sub.nextRunAt,nextRunAt:null}}),
   ]);
  }
  results.push({code,...result});console.log(JSON.stringify({code,...result}));
 }
 await fs.writeFile(".data/audits/freshness-recovery-results-20261101.json",JSON.stringify(results,null,2));
 if(results.some(r=>r.status==="failed"))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>p.$disconnect());
