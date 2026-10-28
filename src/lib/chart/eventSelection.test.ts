import assert from "node:assert/strict";
import { it } from "node:test";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import { DEFAULT_EVENT_VIEW_FILTERS as defaults, sanitizeEventViewFilters } from "./eventViewFilters";
import { eventDisplayColor, eventMarkerVisible, eventPassesContentFilters, mergeChartEvents, eventSourceGroup, selectChartEvents, EVENT_SOURCE_COLORS } from "./eventSelection";
import { groupEventMarkers, marketToMarker } from "./eventMarkerModel";
import { parseMilestoneIngestJson, milestoneToStoredEvent, milestoneToMarketEventDto } from "@/lib/equity/companyMilestones";
import { withEventPresentation } from "@/lib/data/eventPresentation";

function event(patch: Partial<MarketEventDto> = {}): MarketEventDto {
  return { id: "a", externalId: "a", title: "Product launch", content: "Evidence", occurredAt: "2026-10-14T20:30:00Z", datePrecision: "DATETIME", importance: "HIGH", eventType: "company.product", scope: "COMPANY", countries: ["US"], industries: ["45"], assets: ["NVDA"], persons: ["CEO"], institutions: ["NVIDIA"], macroKeys: [], tags: [], payload: {}, markerLabel: "产品", sourceKind: "ai_skill", sourceUrl: "https://example.com/a", isPublic: true, createdById: "system", createdAt: "", updatedAt: "", ...patch };
}

it("local roundtrip preserves timestamps, structured evidence, subject tags and optional links", () => {
  const draft = event({ color: "#7c3aed", sources: [{ url: "https://example.com/evidence", note: "Original" }], readingLinks: [{ url: "https://example.com/background", title: "背景" }], payload: { research: { phase: "trigger" }, macroRelease: { actual: 123 }, impact: { summary: "Demand", channels: ["demand"] } } });
  const parsed = parseMilestoneIngestJson({ events: [draft] });
  assert.deepEqual(parsed.errors, []);
  const stored = milestoneToStoredEvent(parsed.milestones[0]);
  const restored = milestoneToMarketEventDto(parseMilestoneIngestJson({ events: [stored] }).milestones[0]);
  assert.equal(restored.occurredAt, draft.occurredAt);
  assert.equal(restored.datePrecision, "DATETIME");
  assert.deepEqual(restored.assets, ["NVDA"]); assert.deepEqual(restored.industries, ["45"]);
  assert.deepEqual(restored.persons, ["CEO"]); assert.deepEqual(restored.institutions, ["NVIDIA"]);
  assert.equal(restored.color, "#7C3AED"); assert.equal(restored.sources?.[0].note, "Original");
  assert.equal(restored.readingLinks?.[0].title, "背景");
  assert.deepEqual((restored.payload as typeof draft.payload), { ...draft.payload as object, color: "#7C3AED", sources: restored.sources, readingLinks: restored.readingLinks });
});

it("source search, importance, colors and marker switches affect only their own events", () => {
  const system = event({ id: "s", externalId: "s", title: "System report", sourceUrl: "https://example.com/system" });
  const user = event({ id: "u", externalId: "u", title: "User report", sourceKind: "user_local" });
  const state = sanitizeEventViewFilters({ ...defaults, searchQ: "System", markersEnabled: false, typeColors: { "company.product": "#123456" },
    userFilters: { ...defaults, searchQ: "User", typeColors: { "company.product": "#654321" }, markersEnabled: true } });
  const both = selectChartEvents([user], [system], state, "2026-10-01", "2026-10-18");
  assert.equal(both.events.length, 2);
  assert.equal(eventDisplayColor(system, state), "#123456");
  assert.equal(eventDisplayColor(user, state), "#654321");
  assert.equal(eventMarkerVisible(system, state), false);
  assert.equal(eventMarkerVisible(user, state), true);
  const systemHidden = selectChartEvents([user], [system], { ...state, searchQ: "missing" }, "2026-10-01", "2026-10-18");
  assert.deepEqual(systemHidden.events.map(e => e.id), ["u"]);
  assert.equal(systemHidden.sourceStats.system.filteredOut, 1);
  assert.equal(systemHidden.sourceStats.user.filteredOut, 0);
  assert.equal(eventPassesContentFilters(user, { ...state, minImportance: "CRITICAL" }), true);
});

it("filtered personal annotations do not suppress matching system facts", () => {
  const system = event(), user = event({ id: "local:a", sourceKind: "user_local" });
  const state = sanitizeEventViewFilters({ ...defaults, userFilters: { ...defaults, typeFamilies: [] } });
  const result = selectChartEvents([user], [system], state, "2026-10-01", "2026-10-18");
  assert.deepEqual(result.events.map(e => e.id), ["a"]);
  assert.equal(result.sourceStats.user.filteredOut, 1);
});

it("local advanced tag filters narrow user events without changing system visibility", () => {
  const user = event({ sourceKind: "user_local" });
  const state = sanitizeEventViewFilters({ ...defaults, userFilters: { ...defaults, countries: ["CN"] } });
  assert.equal(eventPassesContentFilters(user, state), false);
  assert.equal(eventPassesContentFilters(event(), state), true);
  assert.equal(eventPassesContentFilters(user, { ...state, userFilters: { ...defaults, industries: ["45"], assets: ["NVDA"] } }), true);
  assert.equal(eventPassesContentFilters(user, { ...state, userFilters: { ...defaults, assets: ["AAPL"] } }), false);
});

it("bad color, invalid dates and script URLs fail import without silently losing evidence", () => {
  for (const patch of [{ color: "red" }, { occurredAt: "2026-02-31", datePrecision: "DATE" }, { sources: [{ url: "javascript:alert(1)" }] }, { datePrecision: "DATETIME", occurredAt: "2026-10-14T20:30:00" }]) {
    assert.ok(parseMilestoneIngestJson({ events: [event(patch as Partial<MarketEventDto>)] }).errors.length);
  }
  assert.throws(() => withEventPresentation({}, { readingLinks: [{ url: "javascript:alert(1)" }] }));
});

it("same-day independent events survive while personal corrections override the matching fact", () => {
  const a = event(), b = event({ id: "b", externalId: "b", title: "Second launch", sourceUrl: "https://example.com/b" });
  const correction = event({ id: "local:a", sourceKind: "user_local", title: "Personal annotation" });
  const merged = mergeChartEvents([correction], [a, b]);
  assert.deepEqual(merged.map(e => e.id), ["b", "local:a"]);
  assert.deepEqual(mergeChartEvents([correction], [a, b], false).map(e => e.id), ["a", "b"]);
});

it("search, people, institutions, source and company subtype share one content predicate", () => {
  const e = event();
  assert.equal(eventPassesContentFilters(e, { ...defaults, searchQ: "missing" }), false);
  assert.equal(eventPassesContentFilters(e, { ...defaults, persons: ["Other"] }), false);
  assert.equal(eventPassesContentFilters(e, { ...defaults, institutions: ["Other"] }), false);
  assert.equal(eventPassesContentFilters(e, { ...defaults, companyKinds: [] }), false);
  assert.equal(eventPassesContentFilters(e, { ...defaults, companyKinds: ["product"] }), true);
  assert.equal(eventPassesContentFilters(e, { ...defaults, includeMarket: false }), false);
  assert.equal(eventPassesContentFilters(event({ sourceKind: "user_local" }), { ...defaults, includeMarket: false }), true);
  assert.equal(eventPassesContentFilters(e, { ...defaults, typeFamilies: [] }), false);
});

it("personal colors beat type rules and event defaults; marker keeps the chosen color", () => {
  const e = event({ color: "#112233" });
  const filters = sanitizeEventViewFilters({ ...defaults, typeColors: { "company.product": "#445566" }, eventColors: { a: "#778899" } });
  assert.equal(eventDisplayColor(e, filters), "#778899");
  assert.equal(eventDisplayColor(e, { ...filters, eventColors: {} }), "#445566");
  assert.equal(marketToMarker({ ...e, color: eventDisplayColor(e, filters) }).color, "#778899");
});

it("selected event becomes the primary marker without discarding other events on the bar", () => {
  const a = marketToMarker(event()), b = { ...a, id: "b", largeSurprise: true };
  const group = groupEventMarkers([b, a], "a")[0];
  assert.equal(group.primary.id, "a"); assert.equal(group.extra, 1); assert.equal(group.events.length, 2);
});

it("legacy date-only files still load and do not persist a computed default as explicit color", () => {
  const parsed = parseMilestoneIngestJson({ events: [event({ datePrecision: "DATE", occurredAt: "2025-06-09" })] });
  assert.deepEqual(parsed.errors, []);
  assert.equal(milestoneToStoredEvent(parsed.milestones[0]).color, undefined);
  assert.equal(milestoneToMarketEventDto(parsed.milestones[0]).occurredAt.slice(0, 10), "2025-06-09");
});

it("system and user events have separate default colors while explicit colors remain authoritative", () => {
  const system = event(), user = event({ id: "local:b", externalId: "b", title: "User research", sourceUrl: "https://example.com/user", sourceKind: "user_local" });
  assert.equal(eventSourceGroup(system), "system");
  assert.equal(eventSourceGroup(event({ sourceKind: "sec" })), "system");
  assert.equal(eventSourceGroup(user), "user");
  assert.equal(eventDisplayColor(system), EVENT_SOURCE_COLORS.system);
  assert.equal(eventDisplayColor(user), EVENT_SOURCE_COLORS.user);
  assert.notEqual(eventDisplayColor(system), eventDisplayColor(user));
  assert.equal(eventDisplayColor({ ...user, color: "#123456" }), "#123456");
  assert.equal(marketToMarker(user).color, EVENT_SOURCE_COLORS.user);
  // Changing the management page never enters the shared visibility predicate.
  assert.equal(mergeChartEvents([user], [system]).filter(e => eventPassesContentFilters(e, defaults)).length, 2);
});

it("source lists retain both records while the chart alone merges a shared fact", () => {
  const system = event(), user = event({ id: "local:a", sourceKind: "user_local", title: "Personal annotation" });
  const result = selectChartEvents([user], [system], sanitizeEventViewFilters({}), "2026-10-01", "2026-10-18");
  assert.deepEqual(result.sourceEvents.system.map(e => e.id), ["a"]);
  assert.deepEqual(result.sourceEvents.user.map(e => e.id), ["local:a"]);
  assert.equal(result.events.length, 2);
  assert.deepEqual(result.chartEvents.map(e => e.id), ["local:a"]);
  assert.deepEqual(result.chartProjection.a, { status: "merged", representativeId: "local:a", relatedIds: ["local:a", "a"] });
  assert.equal(result.sourceStats.system.merged, 1);
  assert.equal(result.sourceStats.system.chartCandidates, 0);
  assert.equal(result.sourceStats.user.chartCandidates, 1);
});

it("a personal record disabled or hidden on the chart never suppresses the system marker", () => {
  const system = event(), user = event({ id: "local:a", sourceKind: "user_local" });
  for (const patch of [{ markersEnabled: false }, { hiddenMarkerIds: ["a"] }]) {
    const state = sanitizeEventViewFilters({ userFilters: { ...defaults, ...patch } });
    const result = selectChartEvents([user], [system], state, "2026-10-01", "2026-10-18");
    assert.equal(result.sourceEvents.user.length, 1);
    assert.equal(result.sourceEvents.system.length, 1);
    assert.deepEqual(result.chartEvents.map(e => e.id), ["a"]);
    assert.equal(result.chartProjection.a.status, "candidate");
    assert.equal(result.sourceStats.system.merged, 0);
  }
});

it("exclusion totals partition records once while individual diagnostics retain every failed condition", () => {
  const local = [event({ id: "old", occurredAt: "2025-01-01", sourceKind: "user_local" }), event({ id: "current", sourceKind: "user_local" })];
  const state = sanitizeEventViewFilters({ userFilters: { ...defaults, typeFamilies: [], searchQ: "missing", minImportance: "CRITICAL", countries: ["CN"] } });
  const result = selectChartEvents(local, [], state, "2026-10-01", "2026-10-18");
  const stats = result.sourceStats.user;
  assert.deepEqual(stats.reasons, { range: 1, type: 1 });
  assert.deepEqual(result.excludedEvents.user[0].reasons, ["range", "type", "importance", "search", "country"]);
  assert.deepEqual(result.excludedEvents.user[1].reasons, ["type", "importance", "search", "country"]);
  assert.equal(stats.loaded, stats.outsideRange + stats.inRange);
  assert.equal(stats.inRange, stats.filteredOut + stats.matched);
  assert.equal(Object.values(stats.reasons).reduce((a, b) => a + b, 0) + stats.matched, stats.loaded);
});

it("display outcomes partition all source-list entries without counting merged records twice", () => {
  const user = event({ id: "local:a", sourceKind: "user_local" });
  const state = sanitizeEventViewFilters({ hiddenMarkerIds: ["hidden"], userFilters: { ...defaults, markersEnabled: false } });
  const result = selectChartEvents([user], [event(), event({ id: "sec", sourceKind: "sec" }), event({ id: "hidden", externalId: "hidden" })], state, "2026-10-01", "2026-10-18");
  assert.equal(result.sourceStats.user.markerDisabled, 1);
  assert.equal(result.sourceStats.system.markerHidden, 1);
  assert.equal(result.sourceStats.system.merged, 1);
  for (const stats of Object.values(result.sourceStats)) assert.equal(stats.matched, stats.markerDisabled + stats.markerHidden + stats.merged + stats.chartCandidates);
  assert.deepEqual(result.chartEvents.map(e => e.id), ["a"]);
});
