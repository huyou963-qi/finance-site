import test from "node:test";
import assert from "node:assert/strict";
import { disclosureDays, parseSecDailyIndex, financialVersionReady } from "./dailyDisclosurePolicy";
import { parseSecReleaseAttachments } from "./secEdgar";

test("default range ends on the previous Eastern date, including UTC/Eastern midnight and DST", () => {
  assert.deepEqual(disclosureDays(new Date("2026-10-25T02:00:00Z"), 2), ["2026-10-22", "2026-10-23"]);
  assert.deepEqual(disclosureDays(new Date("2026-11-02T12:00:00Z"), 2), ["2026-10-31", "2026-11-01"]);
  assert.deepEqual(disclosureDays(new Date("2026-01-02T12:00:00Z"), 2), ["2025-12-31", "2026-01-01"]);
  assert.throws(() => disclosureDays(new Date("2026-10-25T12:00:00Z"), 1, "2026-02-30"));
  assert.throws(() => disclosureDays(new Date("2026-10-25T12:00:00Z"), 1, "2026-10-25"));
  assert.throws(() => disclosureDays(new Date(), 1000));
});

test("daily master index handles amendments, filters unrelated forms and fails on malformed target rows", () => {
  assert.equal(parseSecDailyIndex("CIK|Company Name|Form Type|Date Filed|File Name\n320193|Apple|8-K|20261023|edgar/data/320193/0000320193-26-000001.txt")[0].filedAt, "2026-10-23");
  const header = "CIK|Company Name|Form Type|Date Filed|Filename\r\n";
  assert.deepEqual(parseSecDailyIndex(header +
    "320193|Apple Inc.|10-Q/A|2026-10-23|edgar/data/320193/0000320193-26-000001.txt\r\n" +
    "320193|Apple Inc.|4|2026-10-23|edgar/data/320193/0000320193-26-000002.txt\r\n"),
    [{ cik: "0000320193", form: "10-Q/A", filedAt: "2026-10-23", accession: "0000320193-26-000001" }]);
  assert.throws(() => parseSecDailyIndex("<html>access denied</html>"));
  assert.throws(() => parseSecDailyIndex(header + "320193|Apple|10-Q|2026-10-23|bad.txt"));
});

test("a successful download containing only older financial versions cannot complete the new filing", () => {
  assert.equal(financialVersionReady("new", [{ accession: "old", revenue: 100, eps: 1 }]), false);
  assert.equal(financialVersionReady("new", [{ accession: "new", revenue: null, eps: null }]), false);
  assert.equal(financialVersionReady("new", [{ accession: "new", revenue: 0, eps: 0 }]), true);
  assert.equal(financialVersionReady("new", [{ accession: "new", revenue: 100, eps: 1, fiscalDate: "2026-06-30" }], "2026-09-30"), false);
});

test("earnings attachments retain evidence links and readable text, excluding scripts and unsafe filenames", () => {
  const document = (type: string, filename: string, body: string) =>
    `<DOCUMENT>\n<TYPE>${type}\n<FILENAME>${filename}\n<TEXT>${body}</TEXT>\n</DOCUMENT>`;
  const attachments = parseSecReleaseAttachments(
    document("8-K", "report.htm", "Main filing") +
    document("EX-99.1", "earnings.htm", "<p>Revenue &amp; growth</p><script>secret()</script><p>Next quarter</p>") +
    document("EX-99.2", "../../evil.htm", "unsafe"), "0000320193", "0000320193-26-000001");
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].url, "https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/earnings.htm");
  assert.match(attachments[0].text, /Revenue & growth\nNext quarter/);
  assert.doesNotMatch(attachments[0].text, /secret|<script>/);
});
