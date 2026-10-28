import assert from "node:assert/strict";
import { it } from "node:test";
import { describeEmptyEventState, summarizeEventPacks } from "./eventDiagnostics";
import { selectChartEvents } from "./eventSelection";
import { DEFAULT_EVENT_VIEW_FILTERS as defaults } from "./eventViewFilters";
import { buildChartCandidateUrl } from "./buildForChartUrl";

const stats = selectChartEvents([], [], defaults, "2026-01-01", "2026-12-31").sourceStats.system;
const base = { source: "system" as const, filters: defaults, stats, loading: false, error: null, ready: true, packs: summarizeEventPacks([], "AAPL"), symbol: "AAPL" };
it("failures and pending loads never claim a confirmed absence of system events", () => {
  assert.equal(describeEmptyEventState({ ...base, error: "network" }).action, "retry");
  assert.match(describeEmptyEventState({ ...base, error: "network" }).message, /不能据此/);
  assert.match(describeEmptyEventState({ ...base, loading: true }).message, /尚未确定/);
  assert.equal(describeEmptyEventState({ ...base, source: "user", error: null }).action, "manage");
});
it("empty states distinguish disabled source, out of range, content exclusions and missing imports", () => {
  assert.match(describeEmptyEventState({ ...base, filters: { ...defaults, includeSec: false, includeMarket: false } }).message, /来源已关闭/);
  assert.match(describeEmptyEventState({ ...base, stats: { ...stats, loaded: 2, outsideRange: 2 } }).message, /时间区间外/);
  assert.match(describeEmptyEventState({ ...base, stats: { ...stats, loaded: 2, inRange: 2, filteredOut: 2 } }).message, /筛选条件排除/);
  assert.match(describeEmptyEventState({ ...base, source: "user" }).message, /尚未导入/);
  assert.equal(describeEmptyEventState({ ...base, filters: { ...defaults, countries: ["US"] } }).action, "clear");
});
it("pack stages are mutually exclusive and distinguish disabled and inapplicable packages", () => {
  const pack = { name: "test", importedAt: "", events: [], target: "symbol" as const };
  const packs = [
    { ...pack, id: "off", enabled: false, symbols: ["AAPL"] },
    { ...pack, id: "other", enabled: true, symbols: ["TSLA"] },
    { ...pack, id: "all", enabled: true, target: "all-assets" as const },
    { ...pack, id: "aapl", enabled: true, symbols: ["AAPL"] },
  ];
  assert.deepEqual(summarizeEventPacks(packs, "aapl"), { total: 4, disabled: 1, notApplicable: 1, applicable: 2 });
  assert.match(describeEmptyEventState({ ...base, source: "user", packs: summarizeEventPacks(packs.slice(0, 1), "AAPL") }).message, /均已停用/);
  assert.match(describeEmptyEventState({ ...base, source: "user", packs: summarizeEventPacks(packs.slice(1, 2), "AAPL") }).message, /不适用于当前资产/);
});
it("candidate requests retain source records despite source and content switches", () => {
  const first = buildChartCandidateUrl("AAPL", "2026-01-01", "2026-12-31", defaults);
  const second = buildChartCandidateUrl("AAPL", "2026-01-01", "2026-12-31", { ...defaults, includeMarket: false, includeSec: false, typeFamilies: [], minImportance: "CRITICAL", largeSurpriseOnly: true, searchQ: "missing", markersEnabled: false });
  assert.equal(first, second);
  const params = new URL(first, "https://example.com").searchParams;
  assert.equal(params.get("includeSec"), "1");
  assert.equal(params.get("includeMarket"), "1");
  assert.equal(params.get("minImportance"), "LOW");
  assert.equal(params.get("largeSurpriseOnly"), "0");
  assert.notEqual(first, buildChartCandidateUrl("AAPL", "2026-01-01", "2026-12-31", { ...defaults, relationMode: "macro" }));
});
