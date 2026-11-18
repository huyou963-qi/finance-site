import test from "node:test";
import assert from "node:assert/strict";
import { earningsItem, guidanceBackfillReady, guidanceHistoryStart } from "./managementGuidanceBackfill";
import { releaseExhibitsFromIndex } from "./secEdgar";
import { GUIDANCE_PARSER_VERSION } from "./managementGuidance";

test("backfill uses strict earnings items and validated explicit / company-specific history dates", () => {
  assert.equal(earningsItem("2.02,9.01"), true);
  assert.equal(earningsItem("12.02"), false);
  assert.equal(guidanceHistoryStart(undefined, new Date("2010-03-31")), "2010-03-31");
  assert.throws(() => guidanceHistoryStart("2026-02-30", null));
});
test("restart skips complete records, but retries missing and legacy-truncated sources", () => {
  const complete = { attachments: [{ text: "Full source" }], managementGuidance: { parserVersion: GUIDANCE_PARSER_VERSION, records: [], sourceStatus: "available" } };
  assert.equal(guidanceBackfillReady(complete), true);
  assert.equal(guidanceBackfillReady({ ...complete, attachments: [{ text: "x".repeat(20_000) }] }), false);
  assert.equal(guidanceBackfillReady({}), false);
  assert.equal(guidanceBackfillReady({ managementGuidance: { parserVersion: GUIDANCE_PARSER_VERSION, records: [], sourceStatus: "no_eligible_attachment" } }), true);
});
test("lightweight collection follows typed exhibits, refusing external hosts, traversal and untyped attachments", () => {
  const base = '/Archives/edgar/data/123/000000012326000001/';
  const row = (href: string, type = 'EX-99.1') => `<tr><td>2</td><td>Exhibit</td><td><a href="${href}">source</a></td><td>${type}</td></tr>`;
  const files = releaseExhibitsFromIndex(row(base + 'earnings.htm') + row('https://evil.test/steal.htm') + row('../other.htm') + row(base + 'report.htm','8-K') + row(base + 'presentation.pdf'), '0000000123', '0000000123-26-000001');
  assert.equal(files.length, 1);
  assert.equal(files[0].filename, 'earnings.htm');
});
