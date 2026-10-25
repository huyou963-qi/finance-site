import assert from "node:assert/strict";
import test from "node:test";
import { AUDITED_DEFINITIONS, AUDITED_SOURCE_KEYS, auditedDefinitionMetadata } from "./auditedDefinitions";
import { HOUSING_FRED_SERIES, releaseRuleForHousingFred } from "./housingFredSeedCatalog";
import { releaseRuleForFinancialStress } from "./financialStressFredSeedCatalog";
import { RELEASE_PACKAGE_CATALOG } from "./releasePackageCatalog";
import { calendarSpecForSubscription } from "./teEventMap";
import { releaseRuleForPilot } from "./p0SeedCatalog";

test("October24 awaiting-sale definitions preserve IDs and scrape provider", () => {
  for (const [code, unit, key] of [
    ["nbs_cn_realestate_db24f54063787b44be", "%", "property|商品房待售面积：商业营业用房|yoy"],
    ["nbs_cn_realestate_e9a76c570b5c25c176", "万平方米", "property|商品房待售面积：办公楼|amount"],
  ]) {
    const definition = AUDITED_DEFINITIONS.find(row => row.code === code)!;
    const metadata = auditedDefinitionMetadata({ catalogKey: `mds:${code}`,
      scrape: { provider: "nbs_realestate", script: "preserve" } }, definition);
    assert.match(definition.name, /商品房待售面积/);
    assert.equal(metadata.unit, unit);
    assert.equal(metadata.definitionAudit, "2026-10-24-official-source-review");
    assert.equal((metadata as Record<string, unknown>).catalogKey, `mds:${code}`);
    assert.deepEqual(metadata.scrape, { provider: "nbs_realestate", script: "preserve", key });
  }
});

test("October23 definitions preserve identity and correct units/parent", () => {
  for (const [code,unit] of [["sched_fred_RECPROUSM156N","%"],
    ["nbs_cn_realestate_ab8fa19959bcc39da7","亿元"],["nbs_cn_realestate_b774bcd059b15bd9e0","亿元"]]) {
    const d = AUDITED_DEFINITIONS.find(x => x.code === code)!;
    const m = auditedDefinitionMetadata({ catalogKey: "unchanged" }, d);
    assert.equal(m.unit, unit); assert.equal(m.definitionAudit, "2026-10-23-official-source-review");
    assert.equal((m as Record<string,unknown>).catalogKey, "unchanged");
  }
  const code="nbs_cn_realestate_b4f7e9914e9bc85aeb",d=AUDITED_DEFINITIONS.find(x=>x.code===code)!;
  const m=auditedDefinitionMetadata({scrape:{provider:"nbs_realestate",key:"property|办公楼|yoy"}},d);
  assert.deepEqual(m.scrape,{key:AUDITED_SOURCE_KEYS[code],provider:"nbs_realestate"});
});

test("weekly member and package probes agree and cannot wait24h after a prerelease check", () => {
  for(const id of ["MORTGAGE15US","MORTGAGE30US"]) assert.deepEqual(releaseRuleForHousingFred(HOUSING_FRED_SERIES.find(x=>x.fredId===id)!),{type:"probe_interval",intervalHours:6});
  assert.deepEqual(releaseRuleForFinancialStress(),{type:"probe_interval",intervalHours:6});
  for(const id of ["us.freddiemac.pmms","us.stlouisfed.financial_stress_index"]) {
    const rule=RELEASE_PACKAGE_CATALOG.find(x=>x.id===id)!.release;
    assert.equal(rule.type,"probe_interval"); assert.equal((rule as {intervalHours:number}).intervalHours,6);
  }
});

test("October 22 corrections change labels only, preserving canonical source identity", () => {
  for (const code of ["usov_c23_fed_assets", "usov_c24_fed_treasuries"]) {
    const definition = AUDITED_DEFINITIONS.find(row => row.code === code)!;
    const metadata = auditedDefinitionMetadata({ sourceSeriesKey: "unchanged" }, definition);
    assert.equal(metadata.unit, "百万美元");
    assert.equal((metadata as Record<string, unknown>).sourceSeriesKey, "unchanged");
  }
  assert.match(AUDITED_DEFINITIONS.find(row => row.code === "sched_wb_JP_FS_AST_DOMS_GD_ZS")!.name, /金融部门/);
  assert.match(AUDITED_DEFINITIONS.find(row => row.code === "sched_fred_UMCSENT")!.source, /官方CSV/);
});
test("audited label fixes preserve source identity and do not rescale values", () => {
  const definition = AUDITED_DEFINITIONS.find(row => row.code === "sched_fred_FGEXPND")!;
  const metadata = auditedDefinitionMetadata({ catalogKey: "fred:FGEXPND", scrape: { key: "unchanged" } }, definition);
  assert.equal(metadata.unit, "十亿美元");
  assert.equal(metadata.freqLabel, "季");
  assert.equal((metadata as Record<string, unknown>).catalogKey, "fred:FGEXPND");
});
test("monthly constant-maturity yields never use note auction dates", () => {
  for (const id of ["GS2", "GS10"]) {
    assert.equal(calendarSpecForSubscription(id, `sched_fred_${id}`), null);
    assert.notEqual(releaseRuleForPilot(id, "MONTHLY").type, "economic_calendar");
  }
});

test("Indonesia credit label includes nonbank financial sector without altering identity", () => {
  const definition = AUDITED_DEFINITIONS.find(row => row.code === "sched_wb_ID_FS_AST_DOMS_GD_ZS")!;
  const metadata = auditedDefinitionMetadata({ catalogKey: "mds:sched_wb_ID_FS_AST_DOMS_GD_ZS",
    sourceSeriesKey: "ID:FS.AST.DOMS.GD.ZS" }, definition);
  assert.match(metadata.displayName, /金融部门/);
  assert.equal(metadata.definitionAudit, "2026-10-21-official-source-review");
  assert.equal(metadata.unit, "%");
  assert.equal((metadata as Record<string, unknown>).sourceSeriesKey, "ID:FS.AST.DOMS.GD.ZS");
});
