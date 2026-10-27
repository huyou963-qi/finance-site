import test from "node:test";
import assert from "node:assert/strict";
import { parseSecAcceptanceTime, eventReaction, disclosureSession } from "./disclosureTiming";
import { parseReleasePublication, parseSecReleaseEvidence, secIndexRows } from "./secEdgar";

test("SGML acceptance timestamps use Eastern time with DST, not UTC or the raw submissions hint", () => {
  assert.equal(parseSecAcceptanceTime("<ACCEPTANCE-DATETIME>20261021164142")?.toISOString(), "2026-10-21T20:41:42.000Z");
  assert.equal(parseSecAcceptanceTime("&lt;ACCEPTANCE-DATETIME&gt;20260121060102")?.toISOString(), "2026-01-21T11:01:02.000Z");
  assert.equal(parseSecAcceptanceTime("<ACCEPTANCE-DATETIME>20260308023000"), null);
  assert.equal(parseSecAcceptanceTime("<ACCEPTANCE-DATETIME>20261101013000"), null);
  assert.equal(parseSecAcceptanceTime("<ACCEPTANCE-DATETIME>20260230060000"), null);
  const row = secIndexRows({ accessionNumber: ["a"], form: ["10-Q"], filingDate: ["2026-10-21"], acceptanceDateTime: ["2026-10-21T16:41:42Z"] })[0];
  assert.equal(row.acceptanceReportedAt, "2026-10-21T16:41:42Z");
});

test("publication metadata keeps date-only precision and rejects timezone-free or conflicting timestamps", () => {
  const url = "https://www.sec.gov/Archives/release.htm";
  const metadata = (date: string) => `<script type="application/ld+json">${JSON.stringify({ "@type": "NewsArticle", datePublished: date })}</script>`;
  assert.equal(parseReleasePublication(metadata("2026-10-21"), url, "2026-10-21")?.at, null);
  assert.equal(parseReleasePublication(metadata("2026-10-21T16:05:00-04:00"), url, "2026-10-21")?.at, "2026-10-21T20:05:00.000Z");
  assert.equal(parseReleasePublication(metadata("2026-10-21T16:05:00"), url, "2026-10-21"), null);
  assert.equal(parseReleasePublication(metadata("2026-10-21") + metadata("2026-10-22"), url, "2026-10-21"), null);
  assert.equal(parseReleasePublication(metadata("2026-02-30"), url, "2026-03-01"), null);
  assert.equal(parseReleasePublication('<p>Example: "datePublished":"2026-10-21"</p>', url, "2026-10-21"), null);
  const source = '<ACCEPTANCE-DATETIME>20261021164142\n<DOCUMENT><TYPE>EX-99.1\n<FILENAME>release.htm\n<TEXT>' + metadata("2026-10-21T16:05:00-04:00") + '<p>Quarter results.</p></TEXT></DOCUMENT>';
  assert.equal(parseSecReleaseEvidence(source, "1318605", "a", "2026-10-21").publication?.at, "2026-10-21T20:05:00.000Z");
});

const bars = [{ date: "2026-10-20", close: 100 }, { date: "2026-10-21", close: 110 }, { date: "2026-10-22", close: 121 }];
test("premarket and after-close releases use different complete daily windows", () => {
  const now = new Date("2026-10-23T12:00Z");
  const before = eventReaction(new Date("2026-10-21T12:00Z"), "company-release", bars, now);
  assert.equal(before.targetDate, "2026-10-21"); assert.ok(Math.abs(before.value! - 0.1) < 1e-10);
  const after = eventReaction(new Date("2026-10-21T20:05Z"), "company-release", bars, now);
  assert.equal(after.targetDate, "2026-10-22"); assert.ok(Math.abs(after.value! - 0.1) < 1e-10);
  assert.equal(eventReaction(new Date("2026-10-21T16:00Z"), "company-release", bars, now).status, "intraday");
  assert.equal(eventReaction(null, "company-release", bars, now).status, "unknown-time");
  assert.equal(eventReaction(new Date("2026-10-21T20:05Z"), "company-release", bars, new Date("2026-10-22T19:00Z")).value, null);
  assert.equal(eventReaction(new Date("2026-10-21T20:05Z"), "company-release", bars.filter(row => row.date !== "2026-10-22"), now).value, null);
});

test("early closes, holidays and exceptional closures do not turn into regular sessions", () => {
  assert.equal(disclosureSession(new Date("2026-11-27T18:05Z")), "after-close");
  assert.equal(disclosureSession(new Date("2025-01-09T16:00Z")), "closed");
  assert.equal(disclosureSession(new Date("2028-10-21T12:00Z")), "unknown");
  const holiday = eventReaction(new Date("2026-11-26T15:00Z"), "company-release", [], new Date("2026-11-30T12:00Z"));
  assert.equal(holiday.baselineDate, "2026-11-25"); assert.equal(holiday.targetDate, "2026-11-27");
});
