import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMembershipSource } from "./client";

test("在线名单失败时明确报错，禁止静默拿7月快照替代10月名单", async () => {
  const fetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("fixture network unavailable"); };
  try {
    await assert.rejects(loadMembershipSource(true, { readBaseline: async () => { throw new Error("fixture missing baseline"); }, saveBaseline: async () => {}, fetchHoldings: async () => { throw new Error("fixture holdings unavailable"); } }), /禁止自动回退旧快照/);
  } finally { globalThis.fetch = fetch; }
});

test("香港403时只接受新鲜SPY逐项核验，保留真实日期、来源及基线边界", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("rate limited", { status: 403 });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const symbols = Array.from({ length: 503 }, (_, i) => `X${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + i % 26)}`);
  const html = `<table id="constituents">${symbols.map(s => `<tr><td>${s}</td><td>Name</td><td>Sector</td><td>Industry</td></tr>`).join("")}</table><table id="changes">${Array.from({ length: 300 }, () => '<tr><td>January 2, 2020</td><td>AAA</td><td>A</td><td>BBB</td><td>B</td><td>Reason</td></tr>').join("")}</table>`;
  const rows = [...symbols, "2602335D"].map(symbol => ({ etf: "SPY", asOfDate: today, holdingKey: symbol, symbol, cusip: null, name: symbol, weight: 1 / 503, shares: 1 }));
  const deps = {
    readBaseline: async () => ({ version: 1 as const, html, anchor: today, source: "fixture verified Wikipedia", fetchedAt: today, sha256: "fixture" }),
    saveBaseline: async () => { assert.fail("独立持仓核验不能改写Wikipedia基线"); },
    fetchHoldings: async () => ({ etf: "SPY", asOfDate: today, rows, totalWeight: 1 }),
  };
  try {
    const source = await loadMembershipSource(true, deps);
    assert.equal(source.anchor, today);
    assert.deepEqual(source.corroboration, { baselineAnchor: today, asOf: today });
    assert.match(source.source, /holdingsAsOf=/);
    assert.match(source.source, /Wikipedia unavailable: Wikipedia HTTP 403/);
    await assert.rejects(loadMembershipSource(true, { ...deps, fetchHoldings: async () => ({ etf: "SPY", asOfDate: today, rows: rows.slice(1), totalWeight: 1 }) }), /不一致/);
  } finally { globalThis.fetch = originalFetch; }
});
