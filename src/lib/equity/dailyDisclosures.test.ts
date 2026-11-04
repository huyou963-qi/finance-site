import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient, SecFiling } from "@prisma/client";
import type { SecQuarterlyFundamentals } from "./secFundamentals";
import { syncDailyDisclosures } from "./dailyDisclosures";

function harness(mode: "ready" | "old" | "error" | "routine" | "timing-error" = "ready") {
  const rows: SecFiling[] = [];
  const calls = { discovery: 0, facts: 0, snapshot: 0, vintage: 0, attachments: 0, indexes: 0 };
  const accession = "0000320193-20-000001", cik = "0000320193", day = "2020-10-23";
  let headerErrors = mode === "timing-error", headerCalls = 0;
  const indexRow = { accession, form: mode === "routine" ? "8-K" : "10-Q", filedAt: day, primaryDocument: "report.htm", items: null, description: null, reportDate: "2020-09-30" };
  const quarter = { period: "2020Q3", fiscalDate: "2020-09-30", fiscalQuarter: 3, revenue: 100, eps: 1 } as SecQuarterlyFundamentals;
  const due = () => rows.filter(row => row.dailyStatus !== "complete" && (!row.dailyNextAttemptAt || row.dailyNextAttemptAt <= new Date()));
  const db = {
    equitySecurity: { findMany: async () => [{ symbol: "AAPL", cik }] },
    secFiling: {
      findMany: async (args: { select?: unknown; take?: number; where?: {
        acceptedAt?: null; filedAt?: { gte: Date; lte: Date };
        AND?: { OR?: { timingCheckedAt?: null | { lt: Date }; filedAt?: { gte: Date; lte: Date } }[] }[];
      } }) => {
        if (args.where && "acceptedAt" in args.where) {
          const within = (date: Date, range?: { gte: Date; lte: Date }) => !range || (date >= range.gte && date <= range.lte);
          return rows.filter(row => row.dailyStatus === "complete" && !row.acceptedAt && within(row.filedAt, args.where?.filedAt) &&
            args.where?.AND?.[1].OR?.some(condition => condition.timingCheckedAt === null
              ? !row.timingCheckedAt && within(row.filedAt, condition.filedAt)
              : row.timingCheckedAt && condition.timingCheckedAt && row.timingCheckedAt < condition.timingCheckedAt.lt)).slice(0, args.take);
        }
        return args.select ? rows : due().slice(0, args.take);
      },
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
      const row = { id: accession, cik, symbol: "AAPL", ...indexRow, filedAt: new Date(day), reportPeriodEnd: new Date("2020-09-30"),
        dailyStatus: null, dailyAttempts: 0, dailyNextAttemptAt: null, earningsRelease: null } as unknown as SecFiling;
      rows.push(row); return row;
    },
    fetchSecCompanyFacts: async () => { calls.facts++; if (mode === "error") throw new Error("SEC HTTP 503"); return {}; },
    listSecPeriodicFilings: () => [{ accession, form: "10-Q", filedAt: day }],
    buildSecFundamentalVintages: () => [{ ...quarter, accession: mode === "old" ? "old" : accession, form: "10-Q", filedAt: day, checkpoint: true }],
    extractQuarterlyFundamentals: () => [quarter],
    upsertQuarterlyFundamentals: async () => { calls.snapshot++; return 1; },
    upsertFundamentalVintages: async () => { calls.vintage++; return 1; },
    fetchSecReleaseEvidence: async () => { calls.attachments++; return { attachments: [], publication: null, acceptedAt: null, acceptedAtSource: "https://www.sec.gov/" }; },
    fetchSecAcceptanceEvidence: async () => {
      headerCalls++;
      if (headerErrors) throw new Error("header unavailable");
      return { acceptedAt: new Date("2020-10-23T20:00:00Z"), sourceUrl: "https://www.sec.gov/" };
    },
  };
  return { rows, calls, deps, options: { through: day, days: 1 }, repairHeader: () => { headerErrors = false; }, headerCalls: () => headerCalls };
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

test("a stale financial aggregate is repaired from bounded original filings before completion, then remains idempotent", async () => {
  const h = harness("old"); let ready = false, primary = 0;
  const versions = h.deps.listSecPeriodicFilings, vintages = h.deps.buildSecFundamentalVintages;
  h.deps.listSecPeriodicFilings = facts => ready ? versions(facts) : [];
  h.deps.buildSecFundamentalVintages = (facts, options) => vintages(facts, options).map(p => ({ ...p, accession: ready ? "0000320193-20-000001" : "old" }));
  h.deps.supplementSecPeriodicFilingPair = async (_facts, cik, filing, budget) => {
    primary++; assert.equal(cik, 320193); assert.equal(filing.reportDate, "2020-09-30"); assert.equal(budget, 2);
    ready = true; return { facts: { cik, facts: {} }, filingsUsed: 2, handledAccessions: [filing.accession] };
  };
  const result = await syncDailyDisclosures(h.options, h.deps);
  assert.equal(result.complete, 1); assert.equal(h.calls.snapshot, 1); assert.equal(primary, 1);
  await syncDailyDisclosures(h.options, h.deps); assert.equal(primary, 1);
});

test("exhausted context budget stays pending; failed primary retrieval is durable error, never false completion", async () => {
  for (const fails of [false, true]) {
    const h = harness("old");
    h.deps.listSecPeriodicFilings = () => [];
    h.deps.supplementSecPeriodicFilingPair = async (_facts, cik, _filing, budget) => {
      assert.equal(budget, 1);
      if (fails) throw new Error("primary instance unavailable");
      return { facts: { cik, facts: {} }, filingsUsed: 1, handledAccessions: [] };
    };
    const result = await syncDailyDisclosures({ ...h.options, filingFallbackLimit: 1 }, h.deps);
    assert.equal(h.calls.snapshot, 0);
    assert.equal(h.rows[0].dailyStatus, fails ? "error" : "pending");
    assert.equal(fails ? result.failed : result.pending, 1);
    assert.ok(h.rows[0].dailyNextAttemptAt);
  }
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

test("original-filing budget goes to a periodic report that already waited; a skipped filing keeps its attempt", async () => {
  const rows: SecFiling[] = [];
  const supplemented: string[] = [];
  const specs = [
    { cik: "0000000001", accession: "0000000001-20-000001", symbol: "NEW", form: "10-Q", attempts: 0 },
    { cik: "0000000002", accession: "0000000002-20-000001", symbol: "OLD", form: "10-Q", attempts: 4 },
    { cik: "0000000003", accession: "0000000003-20-000001", symbol: "AMD", form: "10-K/A", attempts: 9 },
  ];
  const db = {
    equitySecurity: { findMany: async () => specs.map(spec => ({ symbol: spec.symbol, cik: spec.cik })) },
    secFiling: {
      findMany: async (args: { select?: unknown; take?: number; where?: { acceptedAt?: null } }) =>
        args.where && "acceptedAt" in args.where ? [] : args.select ? rows : rows.filter(row => row.dailyStatus !== "complete").slice(0, args.take),
      count: async () => rows.filter(row => row.dailyStatus !== "complete").length,
      updateMany: async ({ data }: { data: { dailyStatus: string } }) => {
        let count = 0;
        for (const row of rows) if (data.dailyStatus === "pending" && !row.dailyStatus) {
          row.dailyStatus = "pending"; row.dailyNextAttemptAt = new Date(0); count++;
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
  const quarter = { period: "2020Q3", fiscalDate: "2020-09-30", fiscalQuarter: 3, revenue: 100, eps: 1 } as SecQuarterlyFundamentals;
  await syncDailyDisclosures({ through: "2020-10-23", days: 1, filingFallbackLimit: 1 }, {
    prisma: db, pause: async () => {},
    fetchSecDailyIndex: async () => specs.map(spec => ({ cik: spec.cik, accession: spec.accession, form: spec.form, filedAt: "2020-10-23" })),
    discoverSecFilings: async (cik: string) => specs.filter(spec => spec.cik === cik).map(spec => ({
      accession: spec.accession, form: spec.form, filedAt: "2020-10-23", primaryDocument: "r.htm", items: null, description: null, reportDate: "2020-09-30",
    })),
    writeSecFilingIndex: async (cik: string, symbol: string, row: { accession: string; form: string }) => {
      const spec = specs.find(item => item.accession === row.accession)!;
      const stored = { id: row.accession, cik, symbol, ...row, filedAt: new Date("2020-10-23"), reportPeriodEnd: new Date("2020-09-30"),
        dailyStatus: null, dailyAttempts: spec.attempts, dailyNextAttemptAt: null, earningsRelease: null, acceptedAt: new Date(), timingCheckedAt: new Date() } as unknown as SecFiling;
      rows.push(stored); return stored;
    },
    fetchSecCompanyFacts: async () => ({}),
    listSecPeriodicFilings: () => [],
    buildSecFundamentalVintages: () => [{ ...quarter, accession: "other", form: "10-Q", filedAt: "2020-10-23", checkpoint: true }],
    extractQuarterlyFundamentals: () => [quarter],
    upsertQuarterlyFundamentals: async () => 1,
    upsertFundamentalVintages: async () => 1,
    fetchSecReleaseEvidence: async () => ({ attachments: [], publication: null, acceptedAt: null, acceptedAtSource: "https://www.sec.gov/" }),
    fetchSecAcceptanceEvidence: async () => ({ acceptedAt: new Date(), sourceUrl: "https://www.sec.gov/" }),
    supplementSecPeriodicFilingPair: async (_facts, _cik, filing) => {
      supplemented.push(filing.accession);
      return { facts: {}, filingsUsed: 1, handledAccessions: [filing.accession] };
    },
  });
  assert.deepEqual(supplemented, ["0000000002-20-000001"]);
  const bySymbol = Object.fromEntries(rows.map(row => [row.symbol, row]));
  assert.equal(bySymbol.OLD.dailyAttempts, 5);
  assert.equal(bySymbol.NEW.dailyAttempts, 0);
  assert.equal(bySymbol.AMD.dailyAttempts, 9);
  assert.ok(bySymbol.NEW.dailyNextAttemptAt! <= new Date());
  assert.equal(bySymbol.OLD.dailyStatus, "pending");
});

test("a failed timestamp check preserves financial data and retries outside the discovery window without re-downloading facts", async () => {
  const h = harness("timing-error");
  const first = await syncDailyDisclosures(h.options, h.deps);
  assert.equal(first.failed, 1);
  assert.equal(h.rows[0].dailyStatus, "complete");
  assert.equal(h.headerCalls(), 1);
  h.rows[0].timingCheckedAt = new Date(0);
  h.repairHeader();
  const retry = await syncDailyDisclosures({ through: "2020-11-23", days: 1 }, h.deps);
  assert.equal(retry.timingUpdated, 1);
  assert.equal(h.headerCalls(), 2);
  assert.equal(h.calls.facts, 1);
});
