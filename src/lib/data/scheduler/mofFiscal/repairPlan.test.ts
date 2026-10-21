import assert from "node:assert/strict";
import test from "node:test";
import { planMofFiscalPeriodRepair, type FiscalStoredRow } from "./repairPlan";
import type { MofFiscalMonthlyOnlyEvidence } from "./client";
import type { FiscalMeasure } from "./catalog";
import type { ObservationPoint } from "../types";
test("period repair only removes positive monthly matches; missing or conflicting source evidence never deletes", () => {
  const obsDate=new Date("2016-04-01T00:00:00Z");
  const rows: FiscalStoredRow[]=[['vat',2500],['tax_revenue',69],['environmental_tax',10],['general_revenue',15523]].map(([component,value],index)=>({id:String(index),instrumentId:String(index),code:`mof_cn_fiscal_${component}_amount`,obsDate,value:Number(value)}));
  const evidence: MofFiscalMonthlyOnlyEvidence[]=['vat','tax_revenue'].map(component=>({component,obsDate,title:'2016年4月财政收支情况',url:'https://gks.mof.gov.cn/source',measures:new Map([["amount",{obsDate,value:component==='vat'?2500:13782}]])}));
  const history=new Map<string,Map<FiscalMeasure,ObservationPoint[]>>([["general_revenue",new Map([["amount",[{obsDate,value:54419}]]])]]);
  const plan=planMofFiscalPeriodRepair(rows,history,evidence);
  assert.equal(plan.candidates.length,1);
  assert.equal(plan.candidates[0]!.code,"mof_cn_fiscal_vat_amount");
  assert.equal(plan.candidates[0]!.backup.id,"0");
  assert.equal(plan.unresolved.length,2);
  assert.equal(plan.corrections[0]!.officialCumulativeValue,54419);
});

test("wrong-component cleanup needs exact rejected label evidence, and never deletes an authoritative cumulative value", async () => {
  const {parseMofFiscalPage}=await import('./parsePage');
  const {readFileSync}=await import('node:fs');
  const p=parseMofFiscalPage(readFileSync(new URL('./fixtures/2016-04.html',import.meta.url),'utf8'));
  const rows: FiscalStoredRow[]=[['tax_revenue',69],['corporate_income_tax',321],['general_revenue',54419],['nontax_revenue',123456]].map(([component,value],index)=>({id:String(index),instrumentId:String(index),code:`mof_cn_fiscal_${component}_amount`,obsDate:p.obsDate,value:Number(value)}));
  const history=new Map([...p.values].map(([component,measures])=>[component,new Map([...measures].map(([measure,point])=>[measure,[point]]))]));
  const monthly=[...p.monthlyOnly].map(([component,measures])=>({component,measures,obsDate:p.obsDate,url:'https://gks.mof.gov.cn/source',title:'2016年4月财政收支情况'}));
  const rejected=p.wrongComponents.map(item=>({...item,obsDate:p.obsDate,url:'https://gks.mof.gov.cn/source',title:'2016年4月财政收支情况'}));
  const plan=planMofFiscalPeriodRepair(rows,history,monthly,rejected);
  assert.equal(plan.candidates.length,2);
  assert.equal(plan.candidates[0]!.sourceLabel,'车船税、船舶吨税、烟叶税等税收收入');
  assert.equal(plan.candidates[0]!.officialWrongComponentValue,69);
  assert.equal(plan.candidates[1]!.sourceLabel,'房地产企业所得税');
  assert.equal(plan.candidates.every(item=>item.evidenceType==='wrong_component'),true);
  assert.equal(plan.corrections.length,0);
  assert.equal(plan.unresolved.length,1);
});
