import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { FISCAL_NATIVE_TREASURY, FISCAL_HOLDER_FRED, FISCAL_RAW_SUBSCRIPTIONS } from "../../src/lib/data/scheduler/usFiscalFoundation/catalog";
import { FISCAL_CHART_REQUIREMENTS } from "../../src/lib/data/scheduler/usFiscalFoundation/chartRequirements";
import { maturitySchedule, parseMspdSecurities, auctionIssuanceByMonth, type TreasuryRow } from "../../src/lib/data/scheduler/usFiscalFoundation/raw";
import type { CatalogLayoutDocument } from "../../src/lib/data/catalogLayout";
import { resolveUsCatalogPlacement } from "../../src/lib/data/usCatalogTaxonomy";
import { RELEASE_PACKAGE_CATALOG, instrumentMatchesPackageMember } from "../../src/lib/data/scheduler/releasePackageCatalog";

loadEnvConfig(process.cwd());
const prisma=new PrismaClient();
const FRED_IDS=["GFDEBTN","FYGFDPUN","GFDEGDQ188S","FYGFGDQ188S",...FISCAL_HOLDER_FRED.map(r=>r.fredId)];
async function main(){
  if(!process.argv.includes("--db")){
    console.log(JSON.stringify({nativeSeries:FISCAL_NATIVE_TREASURY.length+FRED_IDS.length,rawDatasets:FISCAL_RAW_SUBSCRIPTIONS.length,charts:FISCAL_CHART_REQUIREMENTS},null,2));return;
  }
  const instruments=await prisma.instrument.findMany({where:{OR:[{code:{in:FISCAL_NATIVE_TREASURY.map(r=>r.code)}},{code:{in:FISCAL_RAW_SUBSCRIPTIONS.map(r=>r.code)}},{fredSeriesId:{in:FRED_IDS}}]},include:{dataSubscription:{include:{releasePackage:true}}}});
  const observations=await prisma.macroObservation.findMany({where:{instrumentId:{in:instruments.map(r=>r.id)}},orderBy:{obsDate:"asc"}});
  const byCode=new Map(instruments.map(r=>[r.code,observations.filter(o=>o.instrumentId===r.id)]));
  const errors:string[]=[];
  const expectedCount=FISCAL_NATIVE_TREASURY.length+FRED_IDS.length+FISCAL_RAW_SUBSCRIPTIONS.length;
  if(instruments.length!==expectedCount)errors.push(`指标数量${instruments.length}/${expectedCount}`);
  const scalarAudit=instruments.filter(r=>!FISCAL_RAW_SUBSCRIPTIONS.some(s=>s.code===r.code)).map(r=>{
    const points=byCode.get(r.code)??[],sub=r.dataSubscription;
    const placement=resolveUsCatalogPlacement({key:r.fredSeriesId?`fred:${r.fredSeriesId}`:`mds:${r.code}`});
    if(!points.length)errors.push(`${r.code}无观测`);
    if(!sub?.enabled||!sub.releasePackageId)errors.push(`${r.code}无启用发布包订阅`);
    if(placement.category!=="财政与公共债务"||!placement.subgroup)errors.push(`${r.code}目录位置不确定`);
    if(sub){
      const expected=RELEASE_PACKAGE_CATALOG.filter(p=>instrumentMatchesPackageMember(r,p.members));
      if(expected.length!==1||expected[0]?.id!==sub.releasePackageId)errors.push(`${r.code}发布包成员归属不唯一或错配`);
      const member=expected[0];
      if(member&&JSON.stringify(member.release)!==JSON.stringify(sub.releasePackage?.releaseTemplate))errors.push(`${r.code}发布包规则与代码不一致`);
      const allowedDays=sub.granularity==="DAILY"?10:sub.granularity==="QUARTERLY"?280:100;
      const last=points.at(-1)?.obsDate;
      // FRED季度日期为季度首日；新鲜度按该观测期末衡量，不能凭锚点误报多滞后三个月。
      const periodEnd=last&&sub.granularity==="QUARTERLY" ? new Date(Date.UTC(last.getUTCFullYear(),last.getUTCMonth()+3,0)) : last;
      if(periodEnd&&Date.now()-periodEnd.getTime()>allowedDays*86400000)errors.push(`${r.code}最新观测过期`);
    }
    return {code:r.code,fredId:r.fredSeriesId,name:r.name,unit:r.unit,count:points.length,first:points[0]?.obsDate.toISOString().slice(0,10),latest:points.at(-1)?.obsDate.toISOString().slice(0,10),latestValue:points.at(-1)?.value,
      directory:`美国 / ${placement.category} / ${placement.subgroup}`,packageId:sub?.releasePackageId,enabled:sub?.enabled,releaseRule:sub?.releasePackage?.releaseTemplate,nextRunAt:sub?.nextRunAt,lastSuccessAt:sub?.lastSuccessAt};
  });
  const savedLayout=(await prisma.macroCatalogLayout.findUnique({where:{id:"default"}}))?.layout as CatalogLayoutDocument|undefined;
  const savedPositions=new Map<string,string>();
  for(const country of savedLayout?.countries??[]) if(country.countryCode==="US") for(const category of country.categories) for(const group of category.subgroups) {
    if(group.itemKeys.length>48)errors.push(`目录末组超限：${category.name}/${group.name}`);
    for(const key of group.itemKeys)savedPositions.set(key,`美国 / ${category.name} / ${group.name}`);
  }
  const directoryAudit=scalarAudit.map(row=>{
    const key=row.fredId?`fred:${row.fredId}`:`mds:${row.code}`,actual=savedPositions.get(key);
    if(!actual?.startsWith(row.directory))errors.push(`${row.code}保存的目录布局缺失或错位`);
    return {code:row.code,key,expected:row.directory,actual};
  });
  function monthly(code:string){return new Map((byCode.get(code)??[]).map(r=>[r.obsDate.toISOString().slice(0,7),r.value]));}
  function reconciliation(totalCode:string,terms:Array<[string,number]>,tolerance=1,unit="美元"){
    const total=monthly(totalCode),parts=terms.map(([code,sign])=>({values:monthly(code),sign}));let checked=0,maxError=0;
    const differences:Array<{month:string;difference:number}>=[];
    for(const [month,value]of total){if(!parts.every(p=>p.values.has(month)))continue;checked++;
      const difference=value-parts.reduce((s,p)=>s+p.values.get(month)!*p.sign,0);
      maxError=Math.max(maxError,Math.abs(difference));
      if(Math.abs(difference)>tolerance)differences.push({month,difference});
    }
    const recentCutoff=new Date(Date.UTC(now.getUTCFullYear()-1,now.getUTCMonth(),1)).toISOString().slice(0,7);
    const recentDifferences=differences.filter(r=>r.month>=recentCutoff);
    if(!checked||recentDifferences.length)errors.push(`${totalCode}近期勾稽失败：共${checked}月，近期${recentDifferences.length}处差异`);
    return {checked,unit,tolerance,maxAbsoluteError:maxError,historicalDifferences:differences,recentDifferences};
  }
  const now=new Date();
  const reconciliations={
    receipts:reconciliation("treasury_mts_m01_receipts",["individual","corporate","payroll","unemployment","other_retirement","excise","estate_gift","customs","misc"].map(k=>[`treasury_mts_m09_rcpt_${k}`,1])),
    financing:reconciliation("treasury_mts_m06_financing_total",[["treasury_mts_m06_total_liabilities",1],["treasury_mts_m06_total_assets",-1],["treasury_mts_m06_other_budget",1]]),
    deficit:reconciliation("treasury_mts_m01_deficit",[["treasury_mts_m06_financing_total",1]]),
    marketable:reconciliation("treasury_mspd_marketable_outstanding",["bills","notes","bonds","tips","frn","ffb"].map(k=>[`treasury_mspd_${k}_outstanding`,1]),3.5,"百万美元（7项独立取整容差）"),
  };
  const rawAudit=[];
  for(const config of FISCAL_RAW_SUBSCRIPTIONS){
    const dataset=config.key.slice(4),sub=instruments.find(r=>r.code===config.code)?.dataSubscription;
    const count=await prisma.treasurySourceSnapshot.count({where:{dataset}});
    const first=await prisma.treasurySourceSnapshot.findFirst({where:{dataset},orderBy:{asOfDate:"asc"}});
    const last=await prisma.treasurySourceSnapshot.findFirst({where:{dataset,asOfDate:{lte:now}},orderBy:[{asOfDate:"desc"},{capturedAt:"desc"}]});
    if(!count||!last)errors.push(`${dataset}原始明细未落库`);
    if(!sub?.enabled||sub.releasePackageId!==config.packageId)errors.push(`${dataset}原始明细订阅/发布包异常`);
    rawAudit.push({code:config.code,dataset,count,first:first?.asOfDate.toISOString().slice(0,10),latest:last?.asOfDate.toISOString().slice(0,10),packageId:sub?.releasePackageId,releaseRule:sub?.releasePackage?.releaseTemplate,storage:"mds.treasury_source_snapshot",catalogMeaning:"原始明细OTHER订阅，不冒充可选的单值宏观序列"});
  }
  const mspd=await prisma.treasurySourceSnapshot.findFirst({where:{dataset:"mspd",asOfDate:{lte:now}},orderBy:[{asOfDate:"desc"},{capturedAt:"desc"}]});
  const ladder=mspd?maturitySchedule(mspd.payload as TreasuryRow[],mspd.asOfDate.toISOString().slice(0,10)):null;
  const maturityReconciliations=[];
  if(mspd){
    const rows=mspd.payload as TreasuryRow[],securities=parseMspdSecurities(rows,mspd.asOfDate.toISOString().slice(0,10));
    for(const [type,label] of [["bills","Total Unmatured Treasury Bills"],["notes","Total Unmatured Treasury Notes"],["bonds","Total Unmatured Treasury Bonds"],["frn","Total Unmatured Treasury Floating Rate Notes"]] as const){
      const official=rows.find(r=>r.security_class2_desc===label),amount=official?Number(official.outstanding_amt):Number.NaN;
      const computed=securities.filter(r=>r.type===type).reduce((sum,r)=>sum+r.outstandingMillions,0);
      const differenceMillions=computed-amount;
      if(!Number.isFinite(differenceMillions)||Math.abs(differenceMillions)>0.01)errors.push(`最新MSPD逐券${type}余额与官方未到期小计不符`);
      maturityReconciliations.push({type,computedMillions:computed,officialMillions:amount,differenceMillions});
    }
  }
  const auctionSnapshots=await prisma.treasurySourceSnapshot.findMany({where:{dataset:"auctions",asOfDate:{gte:new Date(Date.UTC(now.getUTCFullYear()-2,0,1))}},orderBy:{capturedAt:"desc"},distinct:["recordKey"]});
  const auctions=auctionIssuanceByMonth(auctionSnapshots.flatMap(r=>r.payload as TreasuryRow[]),now.toISOString().slice(0,10));
  const latestCompleteMonth=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1)).toISOString().slice(0,7);
  if(!auctions.some(row=>row.month===latestCompleteMonth&&row.complete))errors.push("最近完整月份的拍卖结果覆盖不全");
  const keyReady=(key:string)=>key.startsWith("raw:")?rawAudit.some(r=>r.dataset===key.slice(4)&&r.count>0):scalarAudit.some(r=>(key.startsWith("fred:")?r.fredId===key.slice(5):r.code===key)&&r.count>0);
  const charts=FISCAL_CHART_REQUIREMENTS.map(c=>({id:c.id,title:c.title,inputs:c.inputs,ready:c.inputs.every(keyReady),calculation:c.calculation}));
  for(const chart of charts)if(!chart.ready)errors.push(`${chart.id}缺少底层输入`);
  const scope=process.argv.includes("--environment=production") ? "香港生产数据库（显式生产核验）" : "当前工作区配置的开发数据库；未审计/修改生产库";
  const report={auditedAt:new Date().toISOString(),scope,nativeSeries:scalarAudit.length,rawDatasets:rawAudit,series:scalarAudit,directoryAudit,reconciliations,maturityReconciliations,maturityLadder:ladder,auctionMonthlyCoverage:auctions,charts,errors};
  const output=process.argv.find(a=>a.startsWith("--report="))?.slice(9);
  if(output){await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2));console.log(`[verify-fiscal] 报告：${output}`);}
  console.log(JSON.stringify({nativeSeries:scalarAudit.length,observations:observations.length,raw:rawAudit,reconciliations,chartsReady:charts.filter(c=>c.ready).length,errors},null,2));
  if(errors.length)throw new Error(`财政核验${errors.length}项未通过`);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
