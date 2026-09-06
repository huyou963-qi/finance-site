/** Shared Form 3/4/5 + amendments + Item 408 ingestion. --symbols=CRWV --since=2025-01-01 --force */
import { prisma } from "../../src/lib/prisma";
import { syncOwnershipSymbol } from "../../src/lib/equity/ownershipSync";
import { isDay } from "../../src/lib/equity/ownershipReviewValidation";
const arg = (key:string) => process.argv.find(v=>v.startsWith(`${key}=`))?.slice(key.length+1);
async function main() {
  const symbols = process.argv.filter(v=>v.startsWith("--symbols=")).flatMap(v=>v.slice(10).split(",")).map(v=>v.trim().toUpperCase());
  const since = arg("--since") || "2006-01-01";
  if (!isDay(since)) throw new Error("--since 日期无效");
  const limit = Number(arg("--limit"));
  const maxFilings = Number(arg("--max-filings"));
  if (arg("--max-filings") && (!Number.isInteger(maxFilings)||maxFilings<1)) throw new Error("--max-filings 无效");
  const targets = await prisma.equitySecurity.findMany({where:{cik:{not:null},...(symbols.length?{symbol:{in:symbols}}:{})},orderBy:[{marketCap:"desc"},{symbol:"asc"}],...(limit>0?{take:Math.floor(limit)}:{}),select:{symbol:true}});
  if (!targets.length) throw new Error("无匹配标的");
  for (const {symbol} of targets) {
    if (process.argv.includes("--dry-run")) {console.log(symbol);continue;}
    const result = await syncOwnershipSymbol(symbol,{since,maxFilings:maxFilings||undefined,force:process.argv.includes("--force"),plansOnly:process.argv.includes("--plans-only")});
    console.log(symbol,JSON.stringify(result));
    if (result.failed) process.exitCode=1;
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
