import assert from "node:assert/strict";
import test from "node:test";
import type {DataSource} from "@prisma/client";
import {dispatchDelayMs} from "../fetchSubscriptionIncremental";
test("cached real-estate members do not repeat request-level delays",()=>{
  const source=(id:string,minIntervalMs:number)=>({id,rateLimit:{minIntervalMs}} as DataSource);
  const md={scrape:{provider:"nbs_realestate"}};
  assert.equal(dispatchDelayMs(source("nbs-realestate",5000),md),0);
  assert.equal(dispatchDelayMs(source("nbs-realestate",10000),md),10000);
  assert.equal(dispatchDelayMs(source("nbs-realestate",5000)),5000);
  assert.equal(dispatchDelayMs(source("nbs-cpi",5000)),5000);
});
