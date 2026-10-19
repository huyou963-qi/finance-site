import assert from "node:assert/strict";
import { it } from "node:test";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import { DEFAULT_EVENT_VIEW_FILTERS as defaults, sanitizeEventViewFilters } from "./eventViewFilters";
import { eventDisplayColor, eventPassesContentFilters, mergeChartEvents, eventSourceGroup, EVENT_SOURCE_COLORS } from "./eventSelection";
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
