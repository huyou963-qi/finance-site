import assert from "node:assert/strict";
import { it } from "node:test";
import { parseDelivery, planPrivateDelivery } from "./privateEventDelivery";
import { decodeLocalEventPack, localPackEventId, prepareEventPackImport } from "@/lib/equity/localEventPacks";
import { milestoneToMarketEventDto } from "@/lib/equity/companyMilestones";
import { selectChartEvents } from "@/lib/chart/eventSelection";
import { DEFAULT_EVENT_VIEW_FILTERS } from "@/lib/chart/eventViewFilters";
const event = { externalId: "same", occurredAt: "2026-10-14", datePrecision: "DATE", title: "first", markerLabel: "产品", content: "fact", eventType: "company.product", sourceUrl: "https://example.com/first" };
const body = () => ({ deliveryId: "delivery-1", baseRevision: 0, document: { pack: { id: "research", name: "Research", symbols: ["AAPL"] }, events: [event] } });
it("private delivery requires explicit scope, identity, bounded batch and safe source links", () => {
  const b = body(); assert.equal(parseDelivery(b).packId, "research");
  assert.throws(() => parseDelivery({ ...b, userId: "other" }), /userId/);
  assert.throws(() => parseDelivery({ ...b, baseRevision: -1 }), /baseRevision/);
  assert.throws(() => parseDelivery({ ...b, document: { ...b.document, pack: { id: "research" } } }), /指定/);
  assert.throws(() => parseDelivery({ ...b, document: { ...b.document, events: [{ ...event, sources: [{ url: "javascript:alert(1)" }] }] } }), /HTTP/);
  assert.throws(() => parseDelivery({ ...b, document: { ...b.document, events: Array(1001).fill(event) } }), /1000/);
});
it("only identical last delivery is idempotent and stale revisions cannot overwrite facts", () => {
  const input = parseDelivery(body()), first = planPrivateDelivery(input);
  assert.equal(first.duplicate, false); if (first.duplicate) return;
  const existing = { pack: first.pack, revision: 1, deliveryId: input.deliveryId, deliveryHash: input.hash, receipt: first.receipt };
  assert.equal(planPrivateDelivery(parseDelivery(body()), existing).duplicate, true);
  assert.throws(() => planPrivateDelivery(parseDelivery({ ...body(), document: { ...body().document, events: [{ ...event, title: "changed" }] } }), existing), /deliveryId/);
  assert.throws(() => planPrivateDelivery(parseDelivery({ ...body(), deliveryId: "new" }), existing), /版本/);
  const updated = planPrivateDelivery(parseDelivery({ ...body(), deliveryId: "new", baseRevision: 1, document: { ...body().document, events: [{ ...event, title: "changed" }] } }), existing);
  assert.equal(updated.duplicate, false); if (!updated.duplicate) { assert.equal(updated.receipt.updated, 1); assert.equal(updated.receipt.revision, 2); }
});
it("cloud and local packages with equal IDs have distinct display identities and fact namespaces", () => {
  const input = parseDelivery(body());
  const local = prepareEventPackImport([], input.items, input.target, "AAPL", input.metadata).pack;
  const cloud = { ...local, storage: "cloud" as const, events: [{ ...event, title: "unrelated", occurredAt: "2026-10-15", sourceUrl: "https://example.com/other" }] };
  const dtos = [local, cloud].flatMap(decodeLocalEventPack).map(milestoneToMarketEventDto);
  assert.notEqual(dtos[0].id, dtos[1].id);
  assert.equal(dtos[1].id, localPackEventId("research", "same", "cloud"));
  assert.equal(selectChartEvents(dtos, [], DEFAULT_EVENT_VIEW_FILTERS, "2026-01-01", "2026-12-31").chartEvents.length, 2);
});
