import assert from "node:assert/strict";
import test from "node:test";
import { fetchWorldBankHistory } from "./worldbankTransport";
import { fetchWorldBankIncremental } from "./worldbankAdapter";

test("WDI transport scopes proxy, stable query, and fails closed without leaking credentials", async () => {
 const old=globalThis.fetch, env=process.env.WORLD_BANK_PROXY_URL;
 try {
  process.env.WORLD_BANK_PROXY_URL="http://127.0.0.1:18080";
  let calls=0;
  globalThis.fetch=async(url,init)=>{calls++;assert.equal(String(url),"https://api.worldbank.org/v2/country/IT/indicator/CM.MKT.LCAP.GD.ZS?format=json&per_page=100");assert.ok((init as RequestInit & {dispatcher:unknown}).dispatcher);assert.equal(init?.redirect,"error");return new Response(JSON.stringify([{pages:1},[]]));};
  await fetchWorldBankHistory("IT","CM.MKT.LCAP.GD.ZS");
  await assert.rejects(fetchWorldBankHistory("IT/else","bad"),/identity/);assert.equal(calls,1);
  globalThis.fetch=async()=>{calls++;throw Error("proxy-secret-password");};
  await assert.rejects(fetchWorldBankHistory("IT","CM.MKT.LCAP.GD.ZS"), e=> !String(e).includes("secret") && /transport failed/.test(String(e)));assert.equal(calls,2);
  process.env.WORLD_BANK_PROXY_URL="socks5://secret:password@example.com";
  await assert.rejects(fetchWorldBankHistory("IT","CM.MKT.LCAP.GD.ZS"),/requires http/);
  delete process.env.WORLD_BANK_PROXY_URL;
  for(const payload of [[{pages:2},[]],[{},Array(101).fill({})]]) {
   globalThis.fetch=async()=>new Response(JSON.stringify(payload));
   await assert.rejects(fetchWorldBankHistory("IT","CM.MKT.LCAP.GD.ZS"),/pagination/);
  }
  globalThis.fetch=async()=>new Response("bad",{status:502});
  await assert.rejects(fetchWorldBankHistory("IT","CM.MKT.LCAP.GD.ZS"),/HTTP 502/);
 }finally{globalThis.fetch=old;if(env===undefined)delete process.env.WORLD_BANK_PROXY_URL;else process.env.WORLD_BANK_PROXY_URL=env;}
});

test("full history acquisition still persists only the requested revision window and correct country", async()=>{
 const old=globalThis.fetch;
 try{globalThis.fetch=async()=>new Response(JSON.stringify([{pages:1},[
 {country:{id:"IT"},date:"1992",value:7},{country:{id:"IT"},date:"2024",value:0},
 {country:{id:"IT"},date:"2025",value:3},{country:{id:"DE"},date:"2025",value:99}]]));
 const result=await fetchWorldBankIncremental("IT:CM.MKT.LCAP.GD.ZS","2024-01-01");
 assert.deepEqual(result.points.map(x=>x.value),[0,3]);
 }finally{globalThis.fetch=old;}
});
