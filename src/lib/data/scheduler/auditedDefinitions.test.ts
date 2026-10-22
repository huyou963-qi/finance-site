import assert from "node:assert/strict";
import test from "node:test";
import { AUDITED_DEFINITIONS, auditedDefinitionMetadata } from "./auditedDefinitions";
import { calendarSpecForSubscription } from "./teEventMap";
import { releaseRuleForPilot } from "./p0SeedCatalog";

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
