import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { finalizePackageCalendar } from "./syncReleasePackage";
import type { SubscriptionWithRelations } from "./runSubscription";

test("partial package failure fans out earliest retry without calendar refresh",async()=>{
  const retry=new Date("2026-10-10T13:00:00Z"),writes:unknown[]=[];
  const prisma={dataSubscription:{findFirst:async()=>({nextRunAt:retry}),updateMany:async(x:unknown)=>{writes.push(x);}},
    releasePackage:{update:async(x:unknown)=>{writes.push(x);}}} as unknown as PrismaClient;
  const logs:string[]=[];
  await finalizePackageCalendar(prisma,[{id:"member",releasePackageId:"ism"}] as SubscriptionWithRelations[],logs,false);
  assert.match(logs[0]!,/失败成员/);
  assert.deepEqual(writes,[{where:{id:"ism"},data:{nextRunAt:retry}},
    {where:{releasePackageId:"ism",enabled:true},data:{nextRunAt:retry}}]);
});
