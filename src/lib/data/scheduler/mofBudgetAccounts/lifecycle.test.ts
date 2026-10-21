import assert from "node:assert/strict";
import test from "node:test";
import { archiveBudgetAfterBootstrap, budgetSubscriptionEnabled } from "./lifecycle";

test("fresh deployments bootstrap historical-only indicators once before archiving", () => {
  assert.equal(budgetSubscriptionEnabled(false, false), true);
  assert.equal(budgetSubscriptionEnabled(false, true), false);
  assert.equal(budgetSubscriptionEnabled(true, false), true);
  assert.equal(budgetSubscriptionEnabled(true, true), true);
  const metadata = { historicalOnly: true, archiveAfterBootstrap: true };
  assert.equal(archiveBudgetAfterBootstrap("mof-budget-accounts", metadata, 8), true);
  assert.equal(archiveBudgetAfterBootstrap("mof-budget-accounts", metadata, 0), false);
  assert.equal(archiveBudgetAfterBootstrap("other-source", metadata, 8), false);
  assert.equal(archiveBudgetAfterBootstrap("mof-budget-accounts", { historicalOnly: false, archiveAfterBootstrap: true }, 8), false);
});
