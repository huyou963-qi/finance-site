import assert from "node:assert/strict";
import { it } from "node:test";
import { DEFAULT_EVENT_VIEW_FILTERS, hasActiveEventViewContentFilters, sanitizeEventViewFilters } from "./eventViewFilters";
import { buildForChartUrl } from "./buildForChartUrl";

it("old event preferences keep all surprises visible; only boolean true activates the filter", () => {
  assert.equal(sanitizeEventViewFilters({}).largeSurpriseOnly, false);
  assert.equal(sanitizeEventViewFilters({ largeSurpriseOnly: "true" } as never).largeSurpriseOnly, false);
  const filters = sanitizeEventViewFilters({ ...DEFAULT_EVENT_VIEW_FILTERS, largeSurpriseOnly: true });
  assert.equal(hasActiveEventViewContentFilters(filters), true);
  assert.equal(new URL(buildForChartUrl("XAUUSD", "2026-01-01", "2026-10-12", filters), "https://example.com").searchParams.get("largeSurpriseOnly"), "1");
});
