import assert from "node:assert/strict";
import { it } from "node:test";
import { parseMilestoneIngestJson, milestoneToMarketEventDto } from "./companyMilestones";
import { decodeLocalEventPack, localPackEventId, prepareEventPackImport, resolveEventPackFileMetadata, selectLocalPackEvents } from "./localEventPacks";
import { eventDisplayColor, eventIdentity, selectChartEvents } from "@/lib/chart/eventSelection";
import { DEFAULT_EVENT_VIEW_FILTERS as defaults, sanitizeEventViewFilters } from "@/lib/chart/eventViewFilters";
import { migrateLocalEventPreferences } from "@/lib/chart/localEventPreferenceMigration";
import { describeImportedBatch } from "@/lib/chart/eventImportResults";

const raw = (id: string, title = id, date = "2026-10-14") => ({ externalId: id, title, content: title, markerLabel: "产品", eventType: "company.product", occurredAt: date, datePrecision: "DATE", importance: "HIGH", assets: ["AAPL"], sourceUrl: `https://example.com/${title}` });
const items = (...events: ReturnType<typeof raw>[]) => { const parsed = parseMilestoneIngestJson({ events }); assert.deepEqual(parsed.errors, []); return parsed.milestones; };
const make = (id: string, ...events: ReturnType<typeof raw>[]) => prepareEventPackImport([], items(...events), "symbol", "AAPL", { id, name: id }, "2026-10-28").pack;

it("two packages with the same external ID retain independent records and chart preferences", () => {
  const a = make("a", raw("same", "first")), b = make("b", raw("same", "second"));
  const selected = selectLocalPackEvents([a, b], "aapl");
  assert.equal(selected.events.length, 2);
  assert.equal(new Set(selected.events.map(e => e.id)).size, 2);
  const [ea, eb] = selected.events.map(milestoneToMarketEventDto);
  assert.equal(ea.localPackId, "a");
  assert.equal(eventIdentity(ea), localPackEventId("a", "same"));
  const filters = sanitizeEventViewFilters({ userFilters: { ...defaults, hiddenMarkerIds: [ea.id], eventColors: { [ea.id]: "#112233" } } });
  assert.equal(eventDisplayColor(ea, filters), "#112233");
  assert.notEqual(eventDisplayColor(eb, filters), "#112233");
  const result = selectChartEvents([ea, eb], [], filters, "2026-01-01", "2026-12-31");
  assert.equal(result.sourceEvents.user.length, 2);
  assert.deepEqual(result.chartEvents.map(e => e.id), [eb.id]);
  const all = selectChartEvents([ea, eb], [], defaults, "2026-01-01", "2026-12-31");
  assert.equal(all.chartEvents.length, 2, "generic IDs alone are not cross-pack fact evidence");
  const corrected = { ...ea, occurredAt: "2026-10-15T00:00:00.000Z" };
  const remote = { ...ea, id: "system-fact", localPackId: undefined, sourceKind: "ai_skill" };
  const correction = selectChartEvents([corrected], [remote], defaults, "2026-01-01", "2026-12-31");
  assert.equal(correction.chartEvents.length, 1, "existing cross-source stable identity still supports a personal date correction");
});

it("reimport is package-scoped and distinguishes added, updated, unchanged and retained records", () => {
  const a = { ...make("a", raw("same", "before"), raw("unchanged"), raw("retained")), enabled: false, color: "#112233", version: "1" };
  const b = make("b", raw("same", "other"));
  const previous = structuredClone([a, b]);
  const plan = prepareEventPackImport(previous, items(raw("same", "after"), raw("unchanged"), raw("new")), "symbol", "AAPL", { id: "a" }, "2026-10-29");
  assert.deepEqual([plan.receipt.added, plan.receipt.updated, plan.receipt.unchanged, plan.receipt.retained, plan.receipt.otherPackIds], [1, 1, 1, 1, 1]);
  assert.equal(plan.pack.events.length, 4);
  assert.equal(plan.pack.enabled, false);
  assert.equal(plan.pack.color, "#112233");
  assert.equal(plan.pack.version, "1");
  assert.equal(plan.pack.name, "a");
  assert.deepEqual(plan.packs.find(p => p.id === "b"), b);
  assert.deepEqual(previous, [a, b]);
  const repeat = prepareEventPackImport(plan.packs, items(raw("same", "after"), raw("unchanged"), raw("new")), "symbol", "AAPL", { id: "a" });
  assert.deepEqual([repeat.receipt.added, repeat.receipt.updated, repeat.receipt.unchanged], [0, 0, 3]);
});

it("legacy packages are never silently deleted by a new package with matching event IDs", () => {
  const legacy = make("legacy:AAPL", raw("same"));
  const imported = prepareEventPackImport([legacy], items(raw("same")), "symbol", "AAPL", { id: "new" });
  assert.deepEqual(imported.packs[0], legacy);
  assert.equal(selectLocalPackEvents(imported.packs, "AAPL").events.length, 2);
});

it("identity keys preserve original external IDs and avoid separator collisions", () => {
  assert.notEqual(localPackEventId("a:b", "c"), localPackEventId("a", "b:c"));
  const pack = make("研究包:1", raw("id:/1"));
  const event = decodeLocalEventPack(pack)[0];
  assert.equal(event.externalId, "id:/1");
  assert.equal(event.record?.externalId, "id:/1");
  assert.equal(pack.events[0].externalId, "id:/1");
});

it("legacy personal overrides migrate to both packages once without changing system preferences", () => {
  const packs = [make("a", raw("same")), make("b", raw("same"))];
  const state = sanitizeEventViewFilters({ eventColors: { same: "#FFFFFF" }, userFilters: { ...defaults, hiddenMarkerIds: ["same"], hiddenEventIds: ["same"], eventColors: { same: "#112233", [localPackEventId("b", "same")]: "#445566" } } });
  const migrated = migrateLocalEventPreferences(state, packs);
  assert.deepEqual(migrated.userFilters?.hiddenMarkerIds, packs.map(p => localPackEventId(p.id, "same")));
  assert.deepEqual(migrated.userFilters?.hiddenEventIds, migrated.userFilters?.hiddenMarkerIds);
  assert.equal(migrated.userFilters?.eventColors?.[localPackEventId("b", "same")], "#445566");
  assert.equal(migrated.userFilters?.eventColors?.[localPackEventId("a", "same")], "#112233");
  assert.equal(migrated.eventColors?.same, "#FFFFFF");
  assert.equal(state.userFilters?.eventColors?.same, "#112233");
  assert.equal(migrateLocalEventPreferences(migrated, packs), migrated);
});

it("batch inspection lists only this submission and explains range, content, package state and scope", () => {
  const plan = prepareEventPackImport([make("a", raw("retained"))], items(raw("old", "old", "2025-01-01"), raw("current")), "symbol", "AAPL", { id: "a" });
  const state = sanitizeEventViewFilters({ userFilters: { ...defaults, searchQ: "missing" } });
  const batch = describeImportedBatch(plan.receipt, plan.packs, "AAPL", state, "2026-01-01", "2026-12-31");
  assert.equal(batch.rows.length, 2);
  assert.equal(batch.visible, 0);
  assert.ok(batch.rows[0].reasons.includes("不在图表时间区间"));
  assert.ok(batch.rows[1].reasons.includes("不匹配搜索内容"));
  assert.equal(describeImportedBatch(plan.receipt, [{ ...plan.pack, enabled: false }], "AAPL", defaults, "2026-01-01", "2026-12-31").rows[0].reasons[0], "事件包已停用");
  assert.match(describeImportedBatch(plan.receipt, plan.packs, "TSLA", defaults, "2026-01-01", "2026-12-31").rows[0].reasons[0], /不适用于 TSLA/);
  assert.equal(describeImportedBatch(plan.receipt, [], "AAPL", defaults, "2026-01-01", "2026-12-31").missing, 2);
});

it("file scope honors declared assets by default and explicit current-symbol imports override it", () => {
  const rawFile = { pack: { id: "topic", symbols: ["tsla", "TSLA", "NVDA"] } };
  const file = resolveEventPackFileMetadata(rawFile, "topic.json", "symbol", "MSFT", "file");
  const plan = prepareEventPackImport([], items(raw("same")), file.target, "AAPL", file.metadata);
  assert.deepEqual(plan.pack.symbols, ["TSLA", "NVDA"]);
  const single = resolveEventPackFileMetadata({}, "topic.json", "symbol", "TSLA", "file");
  assert.deepEqual(single.metadata.symbols, ["TSLA"]);
  const omittedName = resolveEventPackFileMetadata({ pack: { id: "existing" } }, "renamed-file.json", "symbol", "AAPL", "file");
  const existing = make("existing", raw("same"));
  assert.equal(prepareEventPackImport([existing], items(raw("same")), omittedName.target, "AAPL", omittedName.metadata).pack.name, "existing");
  assert.equal(prepareEventPackImport([], items(raw("same")), omittedName.target, "AAPL", omittedName.metadata).pack.name, "renamed-file.json");
  const explicit = resolveEventPackFileMetadata(rawFile, "topic.json", "symbol", "TSLA", "symbol");
  assert.deepEqual(prepareEventPackImport([], items(raw("same")), explicit.target, "AAPL", explicit.metadata).pack.symbols, ["AAPL"]);
  for (const pack of [{ symbols: "AAPL" }, { symbols: [""] }, { id: "" }, { color: "red" }]) assert.throws(() => resolveEventPackFileMetadata({ pack }, "x", "symbol", null, "file"));
});

it("ID-only legacy input validates unique effective IDs instead of treating every missing externalId as a duplicate", () => {
  const events = [raw("a"), raw("b")].map(({ externalId, ...record }) => ({ ...record, id: externalId }));
  assert.deepEqual(parseMilestoneIngestJson({ events }).errors, []);
  assert.ok(parseMilestoneIngestJson({ events: [events[0], events[0]] }).errors.length > 0);
  assert.throws(() => prepareEventPackImport([], [], "symbol", "AAPL"));
});
