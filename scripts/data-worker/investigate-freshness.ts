/** Read-only, serial source evidence for findings in a freshness report. */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import { fetchWorldBankIncremental } from "../../src/lib/data/scheduler/adapters/worldbankAdapter";
import { fetchCensusPartnerApi } from "../../src/lib/data/scheduler/usTradeDetail/api";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
 const report = JSON.parse(await fs.readFile(".data/audits/macro-verified.json", "utf8"));
 const codes = [...new Set<string>(report.findings.map((f: {instrumentCode: string}) => f.instrumentCode))];
 const rows = await prisma.dataSubscription.findMany({where:{instrument:{code:{in:codes}},enabled:true,sourceId:{in:["worldbank","us-census-trade-detail"]}},include:{instrument:{select:{code:true}}}});
 const evidence = [];
 for (const sub of rows) {
  const code = sub.instrument.code;
  if (sub.sourceId !== "worldbank" && !report.findings.some((f: {code: string; instrumentCode: string}) => f.code === "fetch_error" && f.instrumentCode === code)) continue;
  try {
   const result = sub.sourceId === "worldbank" ? await fetchWorldBankIncremental(sub.sourceSeriesKey!, "1960-01-01", {historyStartYear:1960}) : {points:await fetchCensusPartnerApi(code)};
   const entry = {code, key:sub.sourceSeriesKey,count:result.points.length,first:result.points.at(0),last:result.points.at(-1),checkedAt:new Date().toISOString()};
   evidence.push(entry); console.log(JSON.stringify(entry));
  } catch(error) { const entry={code,error:error instanceof Error?error.message:String(error)};evidence.push(entry);console.log(JSON.stringify(entry)); }
  await fs.writeFile(".data/audits/freshness-source-evidence-20261101.json",JSON.stringify(evidence,null,2));
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
