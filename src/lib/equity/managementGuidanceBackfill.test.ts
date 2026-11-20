import test from "node:test";
import assert from "node:assert/strict";
import { earningsItem, guidanceBackfillReady, guidanceHistoryStart, guidanceHistoryThrough } from "./managementGuidanceBackfill";
import { releaseExhibitsFromIndex, fetchSecText } from "./secEdgar";
import { GUIDANCE_PARSER_VERSION } from "./managementGuidance";

test("backfill uses strict earnings items and validated explicit / company-specific history dates", () => {
  assert.equal(earningsItem("2.02,9.01"), true);
  assert.equal(earningsItem("12.02"), false);
  assert.equal(guidanceHistoryStart(undefined, new Date("2010-03-31")), "2010-03-31");
  assert.throws(() => guidanceHistoryStart("2026-02-30", null));
  assert.equal(guidanceHistoryThrough(undefined, new Date("2026-11-18T06:00:00Z")), "2026-11-17");
  assert.throws(() => guidanceHistoryThrough("2026-11-18", new Date("2026-11-18T06:00:00Z")));
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

test("index accepts joint filer exhibits for the same accession and keeps the true SEC URL", () => {
  const accession = "0000764622-26-000040";
  const base = "/Archives/edgar/data/7286/000076462226000040/";
  const row = (href: string, type: string) => `<tr><td>2</td><td>Exhibit</td><td><a href="${href}">source</a></td><td>${type}</td></tr>`;
  const source = row(base + "press.htm", "EX-99.1") + row(base + "release.txt", "EX-99.A")
    + row(base + "charter.htm", "EX-99.1 CHARTER") + row(base + "%2e%2e/other.htm", "EX-99.2")
    + row(base.replace("000040", "000041") + "other.htm", "EX-99.3");
  assert.deepEqual(releaseExhibitsFromIndex(source, "764622", accession).map(exhibit => exhibit.url),
    ["https://www.sec.gov" + base + "press.htm", "https://www.sec.gov" + base + "release.txt"]);
});

test("overlapping backfill responses retain one shared 250ms request-start budget", async () => {
  const previous = process.env.SEC_BACKFILL_CONCURRENCY;
  process.env.SEC_BACKFILL_CONCURRENCY = "3";
  const starts: number[] = [];
  let active = 0, maxActive = 0;
  const fake: typeof fetch = async () => {
    starts.push(Date.now()); active++; maxActive = Math.max(active, maxActive);
    await new Promise(r => setTimeout(r, 400)); active--;
    return new Response("ok");
  };
  try {
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => fetchSecText(`https://www.sec.gov/test/${i}`, 2000, fake)));
    assert.ok(results.every(s => s === "ok"));
    assert.ok(maxActive > 1 && maxActive <= 3);
    for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 220, `request spacing: ${starts[i] - starts[i - 1]}`);
  } finally {
    if (previous === undefined) delete process.env.SEC_BACKFILL_CONCURRENCY; else process.env.SEC_BACKFILL_CONCURRENCY = previous;
  }
});
