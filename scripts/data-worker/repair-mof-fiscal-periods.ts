/** Auditable repair of historical MONTHLY/wrong-component values in YTD series.
 * Default/--dry-run writes only an audit JSON. --apply requires positive source
 * evidence, exact old-value match and compare-and-delete transaction guards.
 * No Instrument, subscription, or vintage ledger row is deleted. */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchMofFiscalHistory, fetchMofFiscalMonthlyOnlyEvidence, fetchMofFiscalWrongComponentEvidence } from "../../src/lib/data/scheduler/mofFiscal/client";
import { MOF_FISCAL_CODES } from "../../src/lib/data/scheduler/mofFiscal/catalog";
import { planMofFiscalPeriodRepair } from "../../src/lib/data/scheduler/mofFiscal/repairPlan";
loadEnvConfig(process.cwd());
const prisma=new PrismaClient();
async function main() {
  if (process.argv.includes("--apply") && process.argv.includes("--dry-run")) throw new Error("--apply 与 --dry-run 不能同时指定");
  const apply=process.argv.includes("--apply");
  const history=await fetchMofFiscalHistory();
  const evidence=await fetchMofFiscalMonthlyOnlyEvidence();
  const rejectedAliases=await fetchMofFiscalWrongComponentEvidence();
  const instruments=await prisma.instrument.findMany({where:{code:{in:MOF_FISCAL_CODES}},select:{code:true,macroPoints:true}});
  const stored=instruments.flatMap(item=>item.macroPoints.map(row=>({...row,code:item.code})));
  const plan=planMofFiscalPeriodRepair(stored,history,evidence,rejectedAliases);
  const target=path.join(process.cwd(),".data","audits",`mof-fiscal-period-repair-${new Date().toISOString().replace(/[:.]/g,"-")}.json`);
  const audit={generatedAt:new Date().toISOString(),mode:apply?"apply":"dry-run",applied:false,deleted:0,candidates:plan.candidates,unresolved:plan.unresolved,correctionsByFullSync:plan.corrections};
  await mkdir(path.dirname(target),{recursive:true});
  // Persist full original rows and official URL evidence BEFORE any mutation.
  await writeFile(target,JSON.stringify(audit,null,2),"utf8");
  if (apply && plan.candidates.length) {
    const removed=await prisma.$transaction(async tx=>{
      let deleted=0;
      for(const item of plan.candidates){
        const result=await tx.macroObservation.deleteMany({where:{id:item.backup.id,instrumentId:item.backup.instrumentId,obsDate:new Date(item.date),value:item.oldValue}});
        if(result.count!==1) throw new Error(`观测在预检后发生变化，回滚：${item.code} ${item.date}`);
        deleted+=result.count;
      }
      return deleted;
    },{timeout:60_000});
    audit.applied=true; audit.deleted=removed;
    await writeFile(target,JSON.stringify(audit,null,2),"utf8");
  }
  console.log(`[repair-mof-fiscal-periods] mode=${audit.mode} candidates=${plan.candidates.length} unresolved=${plan.unresolved.length} correctionsByFullSync=${plan.corrections.length} deleted=${audit.deleted}`);
  for(const item of plan.candidates) console.log(`${item.code} ${item.date} old=${item.oldValue} evidence=${item.evidenceType} officialMonthly=${item.officialMonthlyValue ?? "n/a"} rejectedLabel=${item.sourceLabel ?? "n/a"} rejectedValue=${item.officialWrongComponentValue ?? "n/a"} ${item.url}`);
  console.log(`audit=${target}`);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
