import assert from "node:assert/strict";
import { it } from "node:test";
import { DEFAULT_EVENT_VIEW_FILTERS, eventFiltersForSource, hasActiveEventViewContentFilters, sanitizeEventViewFilters, updateEventSourceFilters } from "./eventViewFilters";
import { buildForChartUrl } from "./buildForChartUrl";
import { applySymbolDraftToFilters, classifyChartSymbol, deriveEventFilterDraft } from "@/lib/data/chartSymbolProfile";

it("old event preferences keep all surprises visible; only boolean true activates the filter", () => {
  assert.equal(sanitizeEventViewFilters({}).largeSurpriseOnly, false);
  assert.equal(sanitizeEventViewFilters({ largeSurpriseOnly: "true" } as never).largeSurpriseOnly, false);
  const filters = sanitizeEventViewFilters({ ...DEFAULT_EVENT_VIEW_FILTERS, largeSurpriseOnly: true });
  assert.equal(hasActiveEventViewContentFilters(filters), true);
  assert.equal(new URL(buildForChartUrl("XAUUSD", "2026-01-01", "2026-10-12", filters), "https://example.com").searchParams.get("largeSurpriseOnly"), "1");
});

it("legacy shared preferences migrate once and source edits persist independently", () => {
  const legacy = sanitizeEventViewFilters({ searchQ: "legacy", minImportance: "HIGH", typeColors: { other: "#112233" }, assets: ["^GSPC"], countries: ["US"] });
  assert.equal(eventFiltersForSource(legacy, "user").searchQ, "legacy");
  assert.deepEqual(legacy.assets, ["^GSPC"]);
  assert.deepEqual(legacy.userFilters?.assets, []);
  assert.deepEqual(legacy.userFilters?.countries, []);
  const user = updateEventSourceFilters(legacy, "user", { ...eventFiltersForSource(legacy, "user"), searchQ: "user", viewMode: "list" });
  assert.equal(user.searchQ, "legacy");
  assert.equal(user.viewMode, "timeline");
  assert.equal(buildForChartUrl("SPX", "2026-01-01", "2026-10-18", legacy), buildForChartUrl("SPX", "2026-01-01", "2026-10-18", user));
  const system = updateEventSourceFilters(user, "system", { ...DEFAULT_EVENT_VIEW_FILTERS, searchQ: "system" });
  const restored = sanitizeEventViewFilters(JSON.parse(JSON.stringify(system)));
  assert.equal(restored.searchQ, "system");
  assert.equal(restored.userFilters?.searchQ, "user");
  assert.equal(restored.userFilters?.viewMode, "list");
  assert.equal((restored.userFilters as unknown as Record<string, unknown>).userFilters, undefined);
  assert.equal(legacy.searchQ, "legacy");
});

it("system symbol defaults leave user types and tag filters unchanged", () => {
  const state = sanitizeEventViewFilters({ userFilters: { ...DEFAULT_EVENT_VIEW_FILTERS, searchQ: "research", typeFamilies: ["market"], countries: ["CN"] } });
  const next = applySymbolDraftToFilters(state, deriveEventFilterDraft(classifyChartSymbol("SPX")));
  assert.deepEqual(next.userFilters, state.userFilters);
});
