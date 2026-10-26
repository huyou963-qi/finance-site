import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient, SecFiling } from "@prisma/client";
import type { SecQuarterlyFundamentals } from "./secFundamentals";
import { syncDailyDisclosures } from "./dailyDisclosures";

function harness(mode: "ready" | "old" | "error" | "routine" = "ready") {
  const rows: SecFiling[] = [];
  const calls = { discovery: 0, facts: 0, snapshot: 0, vintage: 0, attachments: 0, indexes: 0 };
  const accession = "0000320193-20-000001", cik = "0000320193", day = "2020-10-23";
  const indexRow = { accession, form: mode === "routine" ? "8-K" : "10-Q", filedAt: day, primaryDocument: "report.htm", items: null, description: null, reportDate: "2020-09-30" };
  const quarter = { period: "2020Q3", fiscalDate: "2020-09-30", fiscalQuarter: 3, revenue: 100, eps: 1 } as SecQuarterlyFundamentals;
  const due = () => rows.filter(row => row.dailyStatus !== "complete" && (!row.dailyNextAttemptAt || row.dailyNextAttemptAt <= new Date()));
  const db = {
    equitySecurity: { findMany: async () => [{ symbol: "AAPL", cik }] },
    secFiling: {
      findMany: async (args: { select?: unknown; take?: number }) => args.select ? rows : due().slice(0, args.take),
      count: async () => rows.filter(row => row.dailyStatus !== "complete").length,
      updateMany: async ({ data }: { data: { dailyStatus: string } }) => {
        let count = 0;
        for (const row of rows) {
          if (data.dailyStatus === "pending" && !row.dailyStatus) {
            row.dailyStatus = "pending"; row.dailyNextAttemptAt = new Date(0); count++;
          } else if (data.dailyStatus === "complete" && row.form === "8-K" && row.dailyStatus === "pending") {
            row.dailyStatus = "complete"; count++;
          }
        }
        return { count };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<SecFiling> & { dailyAttempts?: { increment: number } } }) => {
        const row = rows.find(item => item.id === where.id)!;
        const attempts = data.dailyAttempts as unknown as { increment: number } | undefined;
        Object.assign(row, data, { dailyAttempts: row.dailyAttempts + (attempts?.increment ?? 0) });
        return row;
      },
    },
  } as unknown as PrismaClient;
  const deps: NonNullable<Parameters<typeof syncDailyDisclosures>[1]> = {
    prisma: db, pause: async () => {},
    fetchSecDailyIndex: async () => { calls.indexes++; return [{ cik, accession, form: indexRow.form, filedAt: day }]; },
    discoverSecFilings: async () => { calls.discovery++; return [indexRow]; },
    writeSecFilingIndex: async () => {
      const row = { id: accession, cik, symbol: "AAPL", ...indexRow, reportPeriodEnd: new Date("2020-09-30"),
        dailyStatus: null, dailyAttempts: 0, dailyNextAttemptAt: null, earningsRelease: null } as unknown as SecFiling;
      rows.push(row); return row;
    },
    fetchSecCompanyFacts: async () => { calls.facts++; if (mode === "error") throw new Error("SEC HTTP 503"); return {}; },
    listSecPeriodicFilings: () => [{ accession, form: "10-Q", filedAt: day }],
    buildSecFundamentalVintages: () => [{ ...quarter, accession: mode === "old" ? "old" : accession, form: "10-Q", filedAt: day, checkpoint: true }],
    extractQuarterlyFundamentals: () => [quarter],
    upsertQuarterlyFundamentals: async () => { calls.snapshot++; return 1; },
    upsertFundamentalVintages: async () => { calls.vintage++; return 1; },
    fetchSecReleaseAttachments: async () => { calls.attachments++; return []; },
  };
  return { rows, calls, deps, options: { through: day, days: 1 } };
}

test("daily batch is idempotent: completed filings are not downloaded or standardized again", async () => {
  const h = harness();
  const first = await syncDailyDisclosures(h.options, h.deps);
  const second = await syncDailyDisclosures(h.options, h.deps);
  assert.equal(first.complete, 1);
  assert.equal(second.complete, 0);
  assert.equal(h.rows.length, 1);
  assert.deepEqual(h.calls, { discovery: 1, facts: 1, snapshot: 1, vintage: 1, attachments: 0, indexes: 2 });
});

test("lagging Company Facts stays pending and retries after the discovery window", async () => {
  const h = harness("old");
  const first = await syncDailyDisclosures(h.options, h.deps);
  assert.equal(first.pending, 1);
  assert.equal(h.calls.snapshot, 0);
  assert.equal(h.rows[0].dailyStatus, "pending");
  assert.ok(h.rows[0].dailyNextAttemptAt! > new Date());
  h.rows[0].dailyNextAttemptAt = new Date(0);
  const second = await syncDailyDisclosures({ through: "2020-11-23", days: 1 }, h.deps);
  assert.equal(second.pending, 1);
  assert.equal(h.rows[0].dailyAttempts, 2);
});

test("fetch failures leave a durable retry record instead of claiming financial completion", async () => {
  const h = harness("error");
  const result = await syncDailyDisclosures(h.options, h.deps);
  assert.equal(result.failed, 1);
  assert.equal(h.rows[0].dailyStatus, "error");
  assert.match(h.rows[0].dailyError!, /503/);
  assert.equal(h.calls.snapshot, 0);
});

test("dry-run has no source requests and no writes", async () => {
  const h = harness();
  await syncDailyDisclosures({ ...h.options, dryRun: true }, h.deps);
  assert.equal(h.calls.indexes, 0);
  assert.equal(h.rows.length, 0);
});

test("routine 8-K announcements are indexed without downloading Company Facts or release documents", async () => {
  const h = harness("routine");
  const result = await syncDailyDisclosures(h.options, h.deps);
  assert.equal(result.complete, 1);
  assert.equal(h.calls.facts, 0);
  assert.equal(h.calls.attachments, 0);
});
