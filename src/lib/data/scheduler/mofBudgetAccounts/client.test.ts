import assert from "node:assert/strict";
import test from "node:test";
import { fetchMofBudgetAccountsHistory } from "./client";

test("annual members share a failed snapshot without treating the outage as no new data", async () => {
  const previousFetch = globalThis.fetch;
  const previousBypass = process.env.MOF_BUDGET_BYPASS_CACHE;
  process.env.MOF_BUDGET_BYPASS_CACHE = "1";
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("fixture official outage"); };
  try {
    await assert.rejects(fetchMofBudgetAccountsHistory(), /fixture official outage/);
    const members = await Promise.allSettled(Array.from({ length: 10 }, () => fetchMofBudgetAccountsHistory()));
    assert(members.every((member) => member.status === "rejected"));
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBypass == null) delete process.env.MOF_BUDGET_BYPASS_CACHE;
    else process.env.MOF_BUDGET_BYPASS_CACHE = previousBypass;
  }
});
