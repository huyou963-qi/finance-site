import assert from "node:assert/strict";
import test from "node:test";
import { FISCAL_NATIVE_TREASURY, FISCAL_HOLDER_FRED, FISCAL_RAW_SUBSCRIPTIONS } from "./catalog";
import { FISCAL_CHART_REQUIREMENTS } from "./chartRequirements";
import { RELEASE_PACKAGE_CATALOG, instrumentMatchesPackageMember } from "../releasePackageCatalog";
import { resolveUsCatalogPlacement } from "../../usCatalogTaxonomy";

test("all 18 charts have registered native inputs and all native subscriptions have one authoritative package",()=>{
  assert.equal(FISCAL_CHART_REQUIREMENTS.length,18);
  const keys=new Set([...FISCAL_NATIVE_TREASURY.map(r=>r.code),...FISCAL_HOLDER_FRED.map(r=>`fred:${r.fredId}`),...FISCAL_RAW_SUBSCRIPTIONS.map(r=>r.key),"fred:GFDEGDQ188S","fred:FYGFGDQ188S"]);
  for(const chart of FISCAL_CHART_REQUIREMENTS) for(const key of chart.inputs) assert.ok(keys.has(key),`${chart.id}: ${key}`);
  for(const row of FISCAL_NATIVE_TREASURY){
    const matches=RELEASE_PACKAGE_CATALOG.filter(p=>instrumentMatchesPackageMember({code:row.code,fredSeriesId:null},p.members));
    assert.equal(matches.length,1,row.code);assert.equal(matches[0]!.id,row.packageId);
    const placement=resolveUsCatalogPlacement({key:`mds:${row.code}`});
    assert.equal(placement.category,"财政与公共债务");assert.equal(placement.subgroup,row.group,row.code);
    assert.ok(!row.code.includes("proxy") && !row.code.includes("net_weekly") && !row.code.includes("daily_net_cash"));
  }
  for(const row of FISCAL_HOLDER_FRED) assert.equal(resolveUsCatalogPlacement({key:`fred:${row.fredId}`}).subgroup,"债务持有人");
  for(const id of ["GFDEGDQ188S","FYGFGDQ188S"]) assert.equal(resolveUsCatalogPlacement({key:`fred:${id}`}).subgroup,"可持续性比率");
});
