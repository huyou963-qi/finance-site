import assert from "node:assert/strict";
import test from "node:test";
import { AUDITED_DEFINITIONS, auditedDefinitionMetadata } from "./auditedDefinitions";
import { calendarSpecForSubscription } from "./teEventMap";
import { releaseRuleForPilot } from "./p0SeedCatalog";
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
