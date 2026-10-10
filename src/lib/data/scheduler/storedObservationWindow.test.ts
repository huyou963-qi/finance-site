import assert from "node:assert/strict";
import test from "node:test";
import type {PrismaClient} from "@prisma/client";
import {readStoredLastObservationDate,observationWindowForFetch} from "./upsertObservations";
test("backfilled observation date prevents null subscription cache from forcing bootstrap",async()=>{
  const prisma={macroObservation:{findFirst:async(query:unknown)=>{
    assert.deepEqual(query,{where:{instrumentId:"cpi"},orderBy:{obsDate:"desc"},select:{obsDate:true}});
    return {obsDate:new Date("2026-08-01Z")};}}} as unknown as PrismaClient;
  const last=await readStoredLastObservationDate(prisma,"cpi");
  assert.match(observationWindowForFetch(last,3).fetchStart,/^2026-/);
});
test("empty observation store remains a real bootstrap, not a cached success",async()=>{
  const prisma={macroObservation:{findFirst:async()=>null}} as unknown as PrismaClient;
  assert.equal(await readStoredLastObservationDate(prisma,"empty"),null);
});
