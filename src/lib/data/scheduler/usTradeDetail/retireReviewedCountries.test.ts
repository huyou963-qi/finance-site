import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { retireReviewedCensusCountries } from "./retireReviewedCountries";

test("offline lifecycle migration archives both sides without invented dates or observation writes", async () => {
  type WriteArgs = { data: Record<string, unknown> };
  const writes: Array<{target:string;args:WriteArgs}> = [];
  const row = (id:string) => ({id,instrumentId:id,enabled:true,nextRunAt:new Date("2026-10-24"),
    instrument:{code:`census_us_trade_imports_country_nsa_${id}`,metadata:{kept:true}}});
  const p={dataSubscription:{findMany:async({where}:{where:{instrument:{code:{in:string[]}}}})=>{
    assert.equal(where.instrument.code.in.length,12); return [row("4350"),row("4610"),row("5080"),row("5160"),row("7370"),row("7740")];
  },update:async(args:WriteArgs)=>{writes.push({target:"subscription",args});}},
  instrument:{update:async(args:WriteArgs)=>{writes.push({target:"instrument",args});}},
  macroObservation:{findFirst:async()=>({obsDate:new Date("1993-06-01")})},
  scheduleAuditEvent:{create:async(args:WriteArgs)=>{writes.push({target:"audit",args});}},
  $transaction:async(items:Promise<unknown>[])=>Promise.all(items)} as unknown as PrismaClient;
  await retireReviewedCensusCountries(p);
  for(const w of writes.filter(w=>w.target==="subscription")) assert.deepEqual(w.args.data,{enabled:false,nextRunAt:null,lastObsDate:new Date("1993-06-01")});
  const metadata=writes.filter(w=>w.target==="instrument").map(w=>w.args.data.metadata) as Array<{
    kept:boolean;sourceLifecycle:{officialLastPeriod:string|null;successorSpliced:boolean}
  }>;
  assert.deepEqual(metadata.map(m=>m.sourceLifecycle.officialLastPeriod),["1992-12-01","1992-12-01",null,null,"2020-12-01","1993-06-01"]);
  assert.ok(metadata.every(m=>m.kept&&m.sourceLifecycle.successorSpliced===false));
  assert.equal(writes.filter(w=>w.target==="audit").length,6);
});

test("reviewed historical migration is idempotent after cleanup and preserves observation history", async () => {
  const date = new Date("1992-12-01");
  const p = {
    dataSubscription: { findMany: async () => ["4350", "4610"].map(id => ({
      id, instrumentId: id, enabled: false, nextRunAt: null, lastObsDate: date,
      instrument: { code: `census_us_trade_imports_country_nsa_${id}`,
        metadata: { lifecycleAudit: "2026-10-24" } },
    })) },
    macroObservation: { findFirst: async () => ({ obsDate: date }) },
    $transaction: async () => { assert.fail("idempotent migration must not write or delete observations"); },
  } as unknown as PrismaClient;
  await retireReviewedCensusCountries(p);
});
