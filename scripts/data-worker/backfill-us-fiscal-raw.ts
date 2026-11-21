import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchFiscalRawIncremental } from "../../src/lib/data/scheduler/usFiscalFoundation/raw";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";

loadEnvConfig(process.cwd());
const prisma=new PrismaClient();
async function main(){
  const dataset=process.argv.find(a=>a.startsWith("--dataset="))?.slice(10);
  if(dataset!=="mspd"&&dataset!=="auctions")throw new Error("Required --dataset=mspd|auctions");
  const start=process.argv.find(a=>a.startsWith("--from="))?.slice(7)??(dataset==="mspd"?"2001-01-01":"1979-01-01");
  const sub=await prisma.dataSubscription.findFirst({where:{sourceId:"treasury-fiscal-data",sourceSeriesKey:`raw:${dataset}`},include:{source:true,instrument:true,releasePackage:true}});
  if(!sub)throw new Error("Raw subscription missing");
  // Explicit maintenance can run a paused subscription without enabling cron.
  const result=await runDataSubscription(prisma,{...sub,enabled:true},{force:true,preserveNextRunAt:true,skipCalendarRefresh:true,
    fetchIncremental:async()=>{
      const fetched=await fetchFiscalRawIncremental(`raw:${dataset}`,start);
      const batches=fetched.treasurySnapshotBatches!;
      async function* logged(){
        for await(const batch of batches){
          yield batch;
          console.log(JSON.stringify({dataset,persistedWindow:batch.snapshots.at(-1)?.recordKey??"empty",snapshots:batch.snapshots.length,rssMB:Math.round(process.memoryUsage().rss/1024/1024)}));
        }
      }
      return {...fetched,treasurySnapshotBatches:logged()};
    }});
  console.log(JSON.stringify({dataset,start,result}));
  if(result.status==="failed"||result.status==="partial")throw new Error(result.error??"Raw backfill failed");
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
