import test from "node:test";
import assert from "node:assert/strict";
import type { StockEvent } from "./stockEvents";
import { groupStockEvents, releasePeriodEnd } from "./stockEventGroups";

function event(form: string, date: string, periodEnd: string | null, accession: string): StockEvent {
  return { type: form.startsWith("10-Q") ? "earnings" : "8k", date, titleZh: form, form,
    items: form.startsWith("8-K") ? ["2.02"] : [], importance: "high", url: `https://www.sec.gov/${accession}`,
    metrics: null, reaction: null, splitRatio: null,
    disclosure: { accession, periodEnd, collectedAt: `${date}T12:00:00Z`, processedAt: null, status: null, attachments: [] } };
}

test("group the release and periodic report without dropping amendment dates or source links", () => {
  const events = [event("8-K", "2026-10-21", "2026-09-30", "release"), event("10-Q", "2026-10-22", "2026-09-30", "report"),
    event("10-Q/A", "2026-11-10", "2026-09-30", "amendment"), event("8-K", "2026-10-23", null, "unknown")];
  const groups = groupStockEvents(events);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].date, "2026-11-10");
  assert.equal(groups[0].events.length, 3);
  assert.equal(groups.flatMap(group => group.events).length, events.length);
  assert.deepEqual(groups[0].events.map(row => row.disclosure?.accession), ["amendment", "report", "release"]);
  const filtered = groupStockEvents(events.filter(row => row.type === "earnings"));
  assert.equal(filtered.flatMap(group => group.events).some(row => row.type === "8k"), false);
});

test("explicit dates and uniquely corroborated fiscal-quarter titles are accepted; proximity alone is not", () => {
  const references = [{ periodEnd: "2026-09-30", fiscalQuarter: 3 }];
  assert.equal(releasePeriodEnd("Q3 2026 Update", "2026-10-21", references), "2026-09-30");
  assert.equal(releasePeriodEnd("Results for the quarter ended June 27, 2026", "2026-07-30", []), "2026-06-27");
  assert.equal(releasePeriodEnd("An unrelated company announcement", "2026-10-21", references), null);
  assert.equal(releasePeriodEnd("Q3 2027 Update", "2026-10-21", references), null);
  assert.equal(releasePeriodEnd("Q3 2026 Update", "2026-10-21", [...references, { periodEnd: "2026-09-29", fiscalQuarter: 3 }]), null);
  assert.equal(releasePeriodEnd("Quarter ended November 31, 2026", "2026-12-10", []), null);
});
