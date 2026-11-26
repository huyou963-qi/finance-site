import assert from "node:assert/strict";
import test from "node:test";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { PrismaClient } from "@prisma/client";
import type { ResearchPrincipal } from "./oauth";

const prisma = {
  equitySecurity: { findFirst() {} },
  equityFundamentalSnapshot: { findMany() {} },
  secFiling: { findFirst() {} },
  researchMcpCall: { updateMany() {} },
  $transaction() {},
};
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma as unknown as PrismaClient;
const modules = Promise.all([import("./oauth"), import("./tools")]);

const paid: ResearchPrincipal = {
  id: "test", username: "test", role: "user", plan: "pro",
  planExpiresAt: new Date("2099-01-01"), trialEndsAt: null, creditBalance: 0,
  enabledFeatures: ["macro", "equity-stock-data"], scopes: ["research:read"],
};

test("AI access uses the current subscription, independent of trial and backtest credits", async () => {
  const [{ requireResearchEntitlement }] = await modules;
  assert.equal(requireResearchEntitlement(paid), paid);
  assert.throws(() => requireResearchEntitlement({
    ...paid, plan: "standard", trialEndsAt: new Date("2099-01-01"), creditBalance: 100,
  }), { code: "pro_required" });
  assert.throws(() => requireResearchEntitlement({ ...paid, planExpiresAt: new Date(0) }), { code: "pro_required" });
  assert.throws(() => requireResearchEntitlement(null), { code: "invalid_token" });
});

async function send(method: string, params?: unknown, user = paid) {
  const [, { createResearchMcpServer }] = await modules;
  const server = createResearchMcpServer(user);
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(new Request("https://example.com/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }));
    assert.equal(response.status, 200);
    return response.json();
  } finally {
    await server.close();
  }
}

test("SDK discovery exposes separate personal scopes and enforces them before queries", async () => {
  const [{ parseResearchScopes, personalReadScope, personalWriteScope, researchScope }] = await modules;
  const { result } = await send("tools/list");
  assert.deepEqual(result.tools.map((tool: { name: string }) => tool.name), [
    "get_usage", "search_market_indicators", "query_macro_data", "calculate_macro_series",
    "search_system_charts", "search_securities", "search_stock_indicators", "query_stock_data",
    "query_stock_quarterly_financials", "compare_stock_macro_quarters",
    "list_my_stock_templates", "get_my_stock_template", "save_my_stock_template",
  ]);
  for (const tool of result.tools) {
    const write = tool.name === "save_my_stock_template";
    const personal = tool.name.endsWith("my_stock_templates") || tool.name.endsWith("my_stock_template");
    const scopes = personal ? [researchScope, write ? personalWriteScope : personalReadScope] : [researchScope];
    assert.deepEqual(tool.securitySchemes, [{ type: "oauth2", scopes }]);
    assert.equal(tool.annotations.readOnlyHint, !write);
  }
  const restricted = await send("tools/list", undefined, { ...paid, enabledFeatures: [] });
  assert.deepEqual(restricted.result.tools.map((tool: { name: string }) => tool.name), ["get_usage"]);
  const oversized = await send("tools/call", {
    name: "query_stock_data",
    arguments: { symbols: Array.from({ length: 11 }, () => "AAPL"), columns: [{ indicatorId: "sec.name" }] },
  });
  assert.equal(oversized.result.isError, true);

  const phaseTwo: ResearchPrincipal = { ...paid, enabledFeatures: [
    "markets", "equity-ownership", "equity-industries", "weekly", "quant-screener", "forecast-us-nfp",
  ] };
  const next = await send("tools/list", undefined, phaseTwo);
  assert.deepEqual(next.result.tools.map((tool: { name: string }) => tool.name), [
    "get_usage", "get_stock_disclosures", "get_stock_disclosure_archive", "get_stock_guidance", "get_stock_insider_filings",
    "compare_industries", "list_screener_factors", "screen_stocks", "search_research", "get_research", "get_forecast_summary",
    "get_my_watchlist", "add_to_my_watchlist",
  ]);
  const deniedInputs = [
    { name: "get_research", arguments: { kind: "article", id: "draft" } },
    { name: "get_forecast_summary", arguments: { forecast: "us-gdp" } },
    { name: "screen_stocks", arguments: { sortFactor: "roe", topN: 31 } },
    { name: "compare_industries", arguments: { etfs: ["XLB", "XLE", "XLF", "XLK"] } },
  ];
  for (const input of deniedInputs) {
    const denied = await send("tools/call", input, phaseTwo);
    assert.equal(denied.result.isError, true);
  }

  const readOnly = { ...phaseTwo, scopes: [researchScope, personalReadScope] as ResearchPrincipal["scopes"] };
  const access = await send("tools/call", { name: "add_to_my_watchlist", arguments: { symbols: ["AAPL"] } }, readOnly);
  assert.equal(access.result.structuredContent.error.code, "insufficient_scope");
  assert.match(access.result._meta["mcp/www_authenticate"][0], /research:personal:write/);
  const legacy = await send("tools/call", { name: "get_my_watchlist", arguments: {} }, phaseTwo);
  assert.equal(legacy.result.structuredContent.error.code, "insufficient_scope");
  assert.deepEqual(parseResearchScopes(null), [researchScope]);
  assert.throws(() => parseResearchScopes(`${researchScope} articles:write`), { code: "invalid_scope" });
});

test("Pro can read 28 single quarters in one call and page an issuer's archived announcement", async t => {
  const quarterRows = Array.from({ length: 28 }, (_, index) => {
    const fiscalDate = new Date(Date.UTC(2020, index * 3, 0));
    return {
      symbol: "DHI", period: fiscalDate.toISOString().slice(0, 10), fiscalDate,
      fiscalQuarter: index === 1 ? null : index % 4 + 1,
      asOf: fiscalDate, firstReportedAt: new Date(Date.UTC(2020, index * 3, 29)),
      revenue: (index + 1) * 1000, netIncome: null, lines: { costOfRevenue: 500 },
    };
  });
  t.mock.method(prisma.equitySecurity, "findFirst", async () => ({ symbol: "DHI", cik: "882184" }));
  t.mock.method(prisma.equityFundamentalSnapshot, "findMany", async (query: unknown) => {
    const range = { gte: new Date("2019-10-01"), lte: new Date("2026-09-30") };
    assert.deepEqual(query, { where: {
      symbol: { in: ["DHI"] }, periodType: "Q",
      OR: [{ fiscalDate: range }, { fiscalDate: null, asOf: range }],
    } });
    return [...quarterRows].reverse();
  });
  const accession = "0000882184-26-000119";
  const doc = "交付🏠 22,915\n净订单 18,619\n取消率 23%";
  const url = "https://www.sec.gov/Archives/edgar/data/882184/archive.htm";
  t.mock.method(prisma.secFiling, "findFirst", async ({ where }: { where: { cik: string; accession: string } }) => {
    assert.equal(where.cik, "0000882184");
    if (where.accession !== accession) return null;
    return {
      accession, form: "8-K", filedAt: new Date("2026-10-29"), reportPeriodEnd: new Date("2026-10-29"),
      url, items: "2.02,9.01", earningsRelease: { attachments: [
        { filename: "results.htm", url, text: doc },
        { filename: "empty.htm", url, text: "" },
      ] },
    };
  });
  const budget = {
    $queryRaw: async (strings: TemplateStringsArray) => strings[0]?.includes("pg_try_advisory")
      ? [{ locked: true }] : [{ now: new Date("2026-11-26") }],
    researchMcpCall: { deleteMany: async () => ({}), count: async () => 0, groupBy: async () => [], create: async () => ({}) },
    researchMcpUsage: { findUnique: async () => null, upsert: async () => ({}) },
  };
  t.mock.method(prisma, "$transaction", async (work: (tx: typeof budget) => unknown) => work(budget));
  t.mock.method(prisma.researchMcpCall, "updateMany", async () => ({ count: 1 }));
  const user: ResearchPrincipal = { ...paid, enabledFeatures: ["equity-stock-data", "markets"] };
  const call = async (name: string, args: Record<string, unknown>) =>
    (await send("tools/call", { name, arguments: args }, user)).result;
  const qArgs = { symbol: "DHI", startDate: "2019-10-01", endDate: "2026-09-30", indicatorIds: ["fs.revenue", "fs.netIncome", "fs.costOfRevenue"] };
  const quarterly = (await call("query_stock_quarterly_financials", qArgs)).structuredContent;
  assert.equal(quarterly.basis, "single_quarter");
  assert.equal(quarterly.coverage.returnedQuarters, 28);
  assert.deepEqual(quarterly.quarters[0], {
    periodEnd: "2019-12-31", firstReportedAt: "2020-01-29", fiscalYear: 2020, fiscalQuarter: 1,
    values: { "fs.revenue": 1000, "fs.netIncome": null, "fs.costOfRevenue": 500 }, missingIndicatorIds: ["fs.netIncome"],
  });
  assert.equal(quarterly.quarters[1].fiscalYear, null);
  assert.equal(quarterly.quarters.at(-1).periodEnd, "2026-09-30");
  const margins = (await call("query_stock_quarterly_financials", { ...qArgs, indicatorIds: ["fs.grossMargin"] })).structuredContent;
  assert.equal(margins.quarters[0].values["fs.grossMargin"], 0.5);
  assert.equal(margins.quarters[0].grossMarginSource, "revenue_less_cost_over_revenue");
  assert.equal((await call("query_stock_quarterly_financials", { ...qArgs, indicatorIds: ["px.close"] })).isError, true);
  assert.equal((await call("query_stock_quarterly_financials", { ...qArgs, startDate: "2000-01-01" })).isError, true);
  const archive = { symbol: "DHI", accession };
  const selection = (await call("get_stock_disclosure_archive", archive)).structuredContent;
  assert.equal(selection.status, "select_attachment");
  assert.deepEqual(selection.attachments.map((a: { hasArchivedText: boolean }) => a.hasArchivedText), [true, false]);
  const first = (await call("get_stock_disclosure_archive", { ...archive, filename: "results.htm", maxChars: 3 })).structuredContent;
  assert.equal(first.text, "交付🏠");
  assert.equal(first.nextOffset, 3);
  assert.equal(first.filingReportPeriodEnd, "2026-10-29");
  const last = (await call("get_stock_disclosure_archive", { ...archive, filename: "results.htm", offset: first.nextOffset })).structuredContent;
  assert.equal(first.text + last.text, doc);
  assert.equal(last.nextOffset, null);
  assert.equal((await call("get_stock_disclosure_archive", { ...archive, filename: "empty.htm" })).structuredContent.status, "archive_unavailable");
  assert.equal((await call("get_stock_disclosure_archive", { ...archive, accession: "0000882184-26-000110" })).structuredContent.error.code, "NOT_FOUND");
});

test("MCP rate, concurrency and quota denials include distinct retry guidance", async t => {
  let block = "lock";
  const now = new Date("2026-11-26T00:00:00Z");
  const gate = {
    $queryRaw: async (strings: TemplateStringsArray) => strings[0]?.includes("pg_try_advisory")
      ? [{ locked: block !== "lock" }] : [{ now }],
    researchMcpCall: {
      deleteMany: async () => ({}), count: async () => block === "rate" ? 20 : 0,
      findFirst: async () => ({ startedAt: new Date("2026-11-25T23:59:15.500Z") }),
      groupBy: async () => block === "concurrent" ? [{ userId: paid.id, _count: { _all: 2 } }]
        : block === "service" ? [{ userId: "other", _count: { _all: 1000 } }] : [],
    },
    researchMcpUsage: { findUnique: async () => ({ used: 100_000_000 }) },
  };
  t.mock.method(prisma, "$transaction", async (work: (tx: typeof gate) => unknown) => work(gate));
  for (const [cause, code, reason, seconds] of [
    ["lock", "BUSY", "admission_contention", 1],
    ["rate", "RATE_LIMITED", "request_rate", 16],
    ["concurrent", "ACCOUNT_BUSY", "account_concurrency", 2],
    ["service", "BUSY", "service_concurrency", 3],
    ["quota", "QUOTA_EXCEEDED", "monthly_quota", 432000],
  ] as const) {
    block = cause;
    const { result } = await send("tools/call", {
      name: "search_market_indicators", arguments: { query: "CPI" },
    });
    assert.equal(result.isError, true);
    const error = result.structuredContent.error;
    assert.equal(error.code, code);
    assert.equal(error.reason, reason);
    assert.equal(error.retryAfterSeconds, seconds);
    if (cause === "quota") {
      assert.equal(error.remaining, 0);
      assert.equal(error.requestedPoints, 1);
      assert.equal(error.retryAt, "2026-12-01T00:00:00.000Z");
    }
  }
});

test("fiscal windows respect actual boundaries and leave sparse series empty", async () => {
  const { fiscalWindowMean } = await import("./quarterAlignment");
  const start = "2026-06-27", end = "2026-09-26";
  const observations = [
    { date: start, value: 1000 },
    { date: "2026-07-01", value: 3 },
    { date: "2026-08-01", value: 6 },
    { date: end, value: 9 },
    { date: "2026-09-27", value: 1000 },
  ];
  assert.deepEqual(fiscalWindowMean(observations, "monthly", start, end), {
    value: 6, observations: 3, minimumObservations: 3,
  });
  assert.equal(fiscalWindowMean(observations.filter(p => p.date !== end), "monthly", start, end).value, null);
  const weeks = Array.from({ length: 13 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 6, 2 + i * 7)).toISOString().slice(0, 10), value: i,
  }));
  assert.equal(fiscalWindowMean(weeks, "weekly", start, end).value, 6);
  assert.equal(fiscalWindowMean(weeks.slice(0, -1), "weekly", start, end).value, null);
});
