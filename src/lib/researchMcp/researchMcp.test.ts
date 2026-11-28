import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@prisma/client";
import type { ResearchPrincipal } from "./oauth";

const prisma = {
  equitySecurity: { findFirst() {}, findUnique() {}, findMany() {} },
  equityFundamentalSnapshot: { findMany() {} },
  secFiling: { findFirst() {}, findMany() {} },
  equitySplit: { findMany() {} },
  equityDailyBar: { findMany() {} },
  equityPriceCoverage: { findUnique() {} },
  userMacroChartPrefs: { findUnique() {} },
  strategyDefinition: { findFirst() {}, findMany() {} },
  macroRegime: { findMany() {} },
  factorSnapshot: { findMany() {} },
  backtestRun: { findMany() {}, findUnique() {} },
  backtestNav: { findMany() {} },
  robustnessRun: { findMany() {}, findUnique() {} },
  insiderTransaction: { findMany() {} },
  ownershipReview: { findMany() {} },
  session: { findUnique() {} },
  user: { findUnique() {} },
  featureAccessPolicy: { findUnique() {} },
  weeklyOAuthConsent: { deleteMany() {}, create() {}, findUnique() {} },
  $queryRaw() {},
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

test("workspace consent is an unchecked option and only an explicit selection grants it", async t => {
  const [{ workspaceReadScope, researchScope, researchResource }] = await modules;
  const { GET, POST } = await import("@/app/api/mcp/oauth/authorize/route");
  const previousClients = process.env.RESEARCH_MCP_OAUTH_CLIENTS;
  const redirectUri = "https://client.example/callback";
  process.env.RESEARCH_MCP_OAUTH_CLIENTS = JSON.stringify([{ clientId: "p1-client", name: "MCP Test", redirectUris: [redirectUri] }]);
  t.after(() => {
    if (previousClients === undefined) delete process.env.RESEARCH_MCP_OAUTH_CLIENTS;
    else process.env.RESEARCH_MCP_OAUTH_CLIENTS = previousClients;
  });
  t.mock.method(prisma.session, "findUnique", async () => ({ userId: paid.id, expiresAt: new Date("2099-01-01") }));
  t.mock.method(prisma.user, "findUnique", async () => ({ ...paid, status: "active" }));
  t.mock.method(prisma.featureAccessPolicy, "findUnique", async () => ({ policy: { features: { "research-mcp": { status: "released" } } } }));
  t.mock.method(prisma.weeklyOAuthConsent, "deleteMany", async () => ({ count: 0 }));
  let consent: Record<string, unknown> = {};
  const grants: string[] = [];
  t.mock.method(prisma.weeklyOAuthConsent, "create", async ({ data }: { data: Record<string, unknown> }) => { consent = data; });
  t.mock.method(prisma.weeklyOAuthConsent, "findUnique", async ({ where }: { where: { nonceHash: string } }) =>
    consent.nonceHash === where.nonceHash ? consent : null);
  const tx = {
    weeklyOAuthConsent: { deleteMany: async () => ({ count: 1 }) },
    weeklyOAuthGrant: { create: async ({ data }: { data: { scope: string } }) => { grants.push(data.scope); } },
  };
  t.mock.method(prisma, "$transaction", async (work: (transaction: typeof tx) => unknown) => work(tx));
  const origin = new URL(researchResource()).origin;
  const endpoint = `${origin}/api/mcp/oauth/authorize`;
  const request = new URL(endpoint);
  request.search = new URLSearchParams({
    client_id: "p1-client", redirect_uri: redirectUri, scope: `${researchScope} ${workspaceReadScope}`,
    response_type: "code", code_challenge_method: "S256", code_challenge: "a".repeat(43), resource: researchResource(),
  }).toString();
  const headers = { cookie: "finance_sid=mock-session", origin };
  for (const allowWorkspace of [false, true]) {
    const page = await GET(new NextRequest(request, { headers }));
    const html = await page.text();
    assert.equal(page.status, 200, html);
    assert.match(html, /name="viewport" content="width=device-width,initial-scale=1"/);
    const choice = html.match(/<input type="checkbox" name="include_scope" value="research:workspace:read"[^>]*>/)?.[0];
    assert.ok(choice);
    assert.doesNotMatch(choice, /\bchecked\b/);
    const nonce = html.match(/name="nonce" value="([^"]+)"/)?.[1];
    assert.ok(nonce);
    const form = new URLSearchParams({ nonce, decision: "allow" });
    if (allowWorkspace) form.set("include_scope", workspaceReadScope);
    assert.equal((await POST(new NextRequest(endpoint, { method: "POST", headers, body: form }))).status, 303);
  }
  assert.deepEqual(grants, [researchScope, `${researchScope} ${workspaceReadScope}`]);
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
  const [{ parseResearchScopes, personalReadScope, personalWriteScope, researchScope, workspaceReadScope }] = await modules;
  const { result } = await send("tools/list");
  assert.deepEqual(result.tools.map((tool: { name: string }) => tool.name), [
    "get_usage", "search_market_indicators", "query_macro_data", "calculate_macro_series",
    "search_system_charts", "get_system_chart_data", "search_securities", "search_stock_indicators", "query_stock_data",
    "query_stock_quarterly_financials", "compare_stock_macro_quarters",
    "list_my_stock_templates", "get_my_stock_template", "get_my_macro_templates", "save_my_stock_template",
  ]);
  for (const tool of result.tools) {
    const write = tool.name === "save_my_stock_template";
    const personal = /^(get|list|save)_my_/.test(tool.name);
    const extraScope = tool.name === "get_my_macro_templates" ? workspaceReadScope : write ? personalWriteScope : personalReadScope;
    const scopes = personal ? [researchScope, extraScope] : [researchScope];
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
    "get_usage", "get_stock_disclosures", "get_stock_disclosure_archive",
    "compare_stock_peers", "get_stock_event_returns", "render_stock_chart_png", "render_stock_event_pack_chart",
    "get_stock_guidance", "get_stock_insider_filings", "get_stock_ownership_monitor",
    "compare_industries", "list_screener_factors", "screen_stocks", "search_research", "get_research", "get_forecast_summary",
    "get_my_watchlist", "get_my_screener_strategies", "add_to_my_watchlist",
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

function allowResearchBudget(t: TestContext) {
  const budget = {
    $queryRaw: async (strings: TemplateStringsArray) => strings[0]?.includes("pg_try_advisory")
      ? [{ locked: true }] : [{ now: new Date("2026-11-26") }],
    researchMcpCall: { deleteMany: async () => ({}), count: async () => 0, groupBy: async () => [], create: async () => ({}) },
    user: { findUnique: async () => ({ researchMcpMonthlyPoints: null }) },
    researchMcpUsage: { findUnique: async () => null, upsert: async () => ({}) },
  };
  t.mock.method(prisma, "$transaction", async (work: (tx: typeof budget) => unknown) => work(budget));
  t.mock.method(prisma.researchMcpCall, "updateMany", async () => ({ count: 1 }));
}

test("personal P1 tools require consent, enforce report ownership and completion, and page stored results", async t => {
  allowResearchBudget(t);
  const id = "10000000-0000-4000-8000-000000000001";
  const otherId = "10000000-0000-4000-8000-000000000002";
  const queuedId = "10000000-0000-4000-8000-000000000003";
  const anonymousId = "10000000-0000-4000-8000-000000000004";
  const date = new Date("2026-09-30");
  const own = { id, name: "My run", userId: paid.id, status: "done", createdAt: date, finishedAt: date,
    metrics: { sharpe: 1.4 }, params: { weighting: "equal" },
    summary: { periods: [{ date: "2026-09-30", execDate: "2026-10-01", dalioRegime: "reflation" }] } };
  const runs = [own, { ...own, id: otherId, userId: "another-user" }, { ...own, id: queuedId, status: "queued" }, { ...own, id: anonymousId, userId: null }];
  t.mock.method(prisma.backtestRun, "findMany", async ({ where }: { where: { userId: string; status: string } }) =>
    runs.filter(row => row.userId === where.userId && row.status === where.status));
  t.mock.method(prisma.backtestRun, "findUnique", async ({ where }: { where: { id: string; userId: string; status: string } }) =>
    runs.find(row => row.id === where.id && row.userId === where.userId && row.status === where.status) ?? null);
  t.mock.method(prisma.backtestNav, "findMany", async ({ skip, take }: { skip: number; take: number }) =>
    [{ date, nav: 1.1, benchNav: 1.05 }, { date: new Date("2026-10-01"), nav: 1.12, benchNav: 1.05 }].slice(skip, skip + take));
  t.mock.method(prisma.robustnessRun, "findUnique", async ({ where }: { where: { id: string; userId: string; status: string } }) =>
    where.id === id && where.userId === paid.id && where.status === "done"
      ? { ...own, mode: "walkforward", result: { walkforward: { folds: [{ index: 0, testStart: "2026-01-31" }],
        stitchedNav: [{ date: "2026-01-31", nav: 1.1 }], fixedStrategy: true, overallMetrics: { sharpe: 1 } } } } : null);
  const template = { id: "housing", name: "My housing", selectedKeys: ["fred:HOUST1F::yoy"], slotAssignment: { "fred:HOUST1F::yoy": 0 } };
  t.mock.method(prisma.userMacroChartPrefs, "findUnique", async ({ where }: { where: { userId: string } }) => {
    assert.equal(where.userId, paid.id);
    return { prefs: { templates: [template, { ...template, id: "system", builtIn: true }] } };
  });
  t.mock.method(prisma.strategyDefinition, "findFirst", async ({ where }: { where: { id: string; userId: string } }) =>
    where.id === id && where.userId === paid.id ? { id, name: "My strategy", config: { conditions: [] }, createdAt: date, updatedAt: date } : null);
  t.mock.method(prisma.strategyDefinition, "findMany", async ({ where }: { where: { userId: string } }) =>
    where.userId === paid.id ? [{ id, name: "My strategy", createdAt: date, updatedAt: date }] : []);
  const baseline: ResearchPrincipal = { ...paid, enabledFeatures: ["macro", "quant-screener", "quant-backtest"] };
  const authorized: ResearchPrincipal = { ...baseline, enabledFeatures: [...baseline.enabledFeatures, "quant-robustness"],
    scopes: ["research:read", "research:workspace:read"] };
  const call = async (name: string, args: Record<string, unknown>, user = authorized) =>
    (await send("tools/call", { name, arguments: args }, user)).result.structuredContent;
  for (const [tool, args] of [["get_my_macro_templates", {}], ["get_my_screener_strategies", {}], ["list_my_quant_reports", { kind: "backtest" }]] as const) {
    assert.equal((await call(tool, args, baseline)).error.code, "insufficient_scope");
  }
  const legacyGrant: ResearchPrincipal = { ...baseline, scopes: ["research:read", "research:personal:read"] };
  const legacy = await send("tools/call", { name: "list_my_quant_reports", arguments: { kind: "backtest" } }, legacyGrant);
  assert.equal(legacy.result.structuredContent.error.code, "insufficient_scope");
  assert.match(legacy.result._meta["mcp/www_authenticate"][0], /research:workspace:read/);
  const hidden = await send("tools/call", { name: "get_my_quant_report", arguments: { id, kind: "robustness" } },
    { ...baseline, scopes: authorized.scopes });
  assert.equal(hidden.result.isError, true);
  const listed = await call("list_my_quant_reports", { kind: "backtest" });
  assert.deepEqual(listed.reports.map((run: { id: string }) => run.id), [id]);
  for (const deniedId of [otherId, queuedId, anonymousId]) {
    assert.equal((await call("get_my_quant_report", { kind: "backtest", id: deniedId })).error.code, "NOT_FOUND");
  }
  const nav = await call("get_my_quant_report", { kind: "backtest", id, section: "nav", limit: 1 });
  assert.equal(nav.rows[0].nav, 1.1);
  assert.equal(nav.nextOffset, 1);
  const periods = await call("get_my_quant_report", { kind: "backtest", id, section: "regime_periods" });
  assert.equal(periods.rows[0].dalioRegime, "reflation");
  const checks = await call("get_my_quant_report", { kind: "robustness", id, section: "details" });
  assert.equal(checks.rows[0].testStart, "2026-01-31");
  assert.equal(checks.report.walkforward.overallMetrics.sharpe, 1);
  const templates = await call("get_my_macro_templates", {});
  assert.deepEqual(templates.templates.map((t: { id: string }) => t.id), ["housing"]);
  assert.deepEqual((await call("get_my_macro_templates", { id: "housing" })).queryMacroIndicatorIds, ["fred:HOUST1F"]);
  assert.equal((await call("get_my_screener_strategies", {})).strategies[0].id, id);
  assert.equal((await call("get_my_screener_strategies", { id })).strategy.name, "My strategy");
  assert.equal((await call("get_my_screener_strategies", { id: otherId })).error.code, "NOT_FOUND");
});

test("factor and regime tools reuse stored samples and respect missing and excessive coverage", async t => {
  allowResearchBudget(t);
  const factorKey = "grossMargin", dates = [new Date("2026-01-31"), new Date("2026-02-28")];
  t.mock.method(prisma, "$queryRaw", async (strings: TemplateStringsArray) => strings[0]?.includes("DISTINCT")
    ? dates.map(date => ({ date })) : dates.flatMap((date, period) => [
      { symbol: "DHI", date, adj_close: 100 + 10 * period }, { symbol: "LEN", date, adj_close: 100 - 10 * period },
    ]));
  const snapshots = dates.flatMap(date => [
    { date, factorKey, symbol: "DHI", zscore: 1, sectorZscore: 1 },
    { date, factorKey, symbol: "LEN", zscore: -1, sectorZscore: -1 },
  ]);
  let panelLimit: number | undefined;
  t.mock.method(prisma.factorSnapshot, "findMany", async ({ take }: { take: number }) => {
    panelLimit = take;
    return snapshots;
  });
  t.mock.method(prisma.macroRegime, "findMany", async () => [{
    date: dates[0], regime: "recovery", dalioRegime: "reflation", growthState: "above", growthDirection: "rising",
    inflationState: "rising", recession: -1, inputs: { internal: true },
  }]);
  const user: ResearchPrincipal = { ...paid, enabledFeatures: ["quant-regime", "quant-factor-research"] };
  const call = async (name: string, args: Record<string, unknown>) =>
    (await send("tools/call", { name, arguments: args }, user)).result.structuredContent;
  const range = { startDate: "2026-01-01", endDate: "2026-03-01" };
  const regime = await call("get_macro_regime", range);
  assert.equal(regime.observations[0].dalioRegime, "reflation");
  assert.equal(regime.observations[0].recession, null);
  assert.equal(regime.observations[0].inputs, undefined);
  const report = await call("get_factor_research_summary", { ...range, factorKeys: [factorKey], quantiles: 2 });
  assert.equal(report.factors[0].ic.meanIC, 1);
  assert.equal(report.factors[0].icByRegime.stagflation, null);
  assert.equal(panelLimit, 300001);
  assert.equal((await call("get_factor_research_summary", { ...range, startDate: "2010-01-01", factorKeys: [factorKey] })).error.code, "INVALID_INPUT");
});

test("ownership MCP exposes confirmed sales and verified plans with incomplete coverage", async t => {
  allowResearchBudget(t);
  const asOf = "2026-09-05";
  const url = "https://www.sec.gov/Archives/edgar/data/882184/000088218426000119/results.htm";
  const plan = { id: "jane:2026-07-01", ownerName: "Jane", ownerCik: "2", adopted: "2026-07-01", start: "2026-08-01",
    end: "2026-12-31", terminated: null, maxShares: 300, security: "Common Stock", account: "direct:2",
    status: "adopted", rule10b51: true, conditions: "", sourceUrl: url, filedAt: "2026-07-02", evidence: "test", verified: true };
  t.mock.method(prisma.equitySecurity, "findFirst", async () => ({ cik: "882184", symbol: "DHI" }));
  let synchronized = false;
  t.mock.method(prisma.equitySecurity, "findUnique", async () => ({ name: "D.R. Horton", metadata: { ownershipCoverage: {
    since: "2026-01-01", through: asOf, checkedAt: asOf, complete: synchronized, error: "internal upstream details",
  } } }));
  t.mock.method(prisma, "$queryRaw", async (sql: TemplateStringsArray, ...args: unknown[]) => {
    if (sql.join("").includes("AS indexed")) {
      assert.deepEqual(args.slice(-2), [new Date("2026-06-08"), new Date(asOf)]);
      return [synchronized ? { indexed: 20, parsed: 20, readable: 20 } : { indexed: 20, parsed: 17, readable: 16 }];
    }
    return [{ filedAt: new Date("2026-07-02"), ownershipData: {
      version: 2, holdings: [], plans: [plan, { ...plan, id: "unverified", verified: false }],
    } }];
  });
  t.mock.method(prisma.ownershipReview, "findMany", async () => []);
  t.mock.method(prisma.equityDailyBar, "findMany", async () => []);
  t.mock.method(prisma.equitySplit, "findMany", async () => []);
  t.mock.method(prisma.equityPriceCoverage, "findUnique", async () => null);
  const trade = {
    cik: "882184", accession: "0000882184-26-000119", filerCik: "2", filerName: "Jane", lineIndex: 1,
    transactionDate: new Date("2026-08-05"), filedAt: new Date("2026-08-06"),
    transactionCode: "S", acquiredDisposedCode: "D", shares: 100, pricePerShare: 120, sharesOwnedAfter: 1000,
    evidence: { security: "Common Stock", ownership: "D", owners: [{ cik: "2", name: "Jane" }], footnotes: [],
      documentType: "4", derivative: false, plan: false },
  };
  const pendingTrade = { ...trade, lineIndex: 2, evidence: null };
  let rows = [trade, pendingTrade];
  t.mock.method(prisma.insiderTransaction, "findMany", async () => rows);
  const user: ResearchPrincipal = { ...paid, enabledFeatures: ["equity-ownership"] };
  const call = async (section: string, offset = 0) => (await send("tools/call", {
    name: "get_stock_ownership_monitor", arguments: { symbol: "DHI", asOf, section, limit: 1, offset },
  }, user)).result.structuredContent;
  const summary = await call("transactions");
  assert.deepEqual(summary.transactions.map((row: { reportedShares: number }) => row.reportedShares), [100]);
  assert.equal(summary.supply[0].netSells90, 100);
  assert.equal(summary.supply[0].netSellingToFloat90, null);
  assert.equal(summary.coverage.error, undefined);
  assert.equal(summary.nextOffset, null);
  assert.equal(summary.resultSummary.coverageStatus, "incomplete");
  assert.equal(summary.resultSummary.matchedCount, 1);
  assert.equal(summary.form4Coverage.withoutStructuredDocument, 3);
  assert.equal(summary.form4Coverage.parsedOutsideMonitorSymbol, 1);
  const pastLastPage = await call("transactions", 1);
  assert.equal(pastLastPage.resultSummary.matchedCount, 1);
  assert.equal(pastLastPage.resultSummary.returnedCount, 0);
  const plans = await call("plans");
  assert.equal(plans.plans[0].id, plan.id);
  assert.equal(plans.plans[0].remainingUpperBoundShares, null);
  assert.equal(plans.nextOffset, null);
  rows = [];
  const empty = await call("transactions");
  assert.deepEqual(empty.transactions, []);
  assert.equal(empty.resultSummary.matchedCount, 0);
  assert.match(empty.resultSummary.message, /覆盖不完整，未检出已核实/);

  synchronized = true;
  rows = [
    { ...trade, lineIndex: 3, evidence: { ...trade.evidence, derivative: true } },
    { ...pendingTrade, lineIndex: 4, transactionCode: "M" },
  ];
  const complete = await call("transactions");
  assert.deepEqual(complete.transactions, []);
  assert.equal(complete.resultSummary.coverageStatus, "complete");
  rows.push(pendingTrade);
  assert.equal((await call("transactions")).resultSummary.coverageStatus, "incomplete");
});

test("Pro can read 28 single quarters in one call and page an issuer's archived announcement", async t => {
  const quarterRows = Array.from({ length: 28 }, (_, index) => {
    const fiscalDate = new Date(Date.UTC(2020, index * 3, 0));
    return {
      symbol: "DHI", period: fiscalDate.toISOString().slice(0, 10), fiscalDate,
      fiscalQuarter: index === 1 ? null : index % 4 + 1,
      asOf: fiscalDate, firstReportedAt: new Date(Date.UTC(2020, index * 3, 29)),
      revenue: (index + 1) * 1000, netIncome: null, grossMargin: index === 27 ? 0 : null,
      lines: { costOfRevenue: 500, ...(index === 26 ? { grossProfit: 9000 } : {}) },
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
    $executeRaw: async () => 0,
    equitySecurity: { findMany: async () => [{ symbol: "DHI", name: "D.R. Horton" }] },
    equityFundamentalSnapshot: { findMany: async () => quarterRows },
    $queryRaw: async (strings: TemplateStringsArray) => strings[0]?.includes("pg_try_advisory")
      ? [{ locked: true }] : [{ now: new Date("2026-11-26") }],
    researchMcpCall: { deleteMany: async () => ({}), count: async () => 0, groupBy: async () => [], create: async () => ({}) },
    user: { findUnique: async () => ({ researchMcpMonthlyPoints: null }) },
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
  const batch = (await call("query_stock_data", {
    symbols: ["DHI"], columns: [
      { indicatorId: "fs.grossMargin", params: { period: { kind: "FQ", year: 2020, q: 1 } } },
      { indicatorId: "fs.grossMargin", params: { period: { kind: "FQ", year: 2026, q: 3 } } },
      { indicatorId: "fs.grossMargin", params: { period: { kind: "latestQ" } } },
    ],
  })).structuredContent;
  const cells = Object.values(batch.rows[0].cells) as { v: number; s: string; d: string; grossMarginSource: string }[];
  assert.deepEqual(cells.map(cell => cell.grossMarginSource), ["revenue_less_cost_over_revenue", "gross_profit_over_revenue", "stored"]);
  for (const cell of cells) {
    const quarter = margins.quarters.find((row: { periodEnd: string }) => row.periodEnd === cell.d);
    assert.equal(cell.s, "ok");
    assert.equal(cell.v, quarter.values["fs.grossMargin"]);
    assert.equal(cell.grossMarginSource, quarter.grossMarginSource);
  }
  assert.equal(cells.at(-1)?.v, 0);
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
    user: { findUnique: async () => ({ researchMcpMonthlyPoints: block === "zero_quota" ? 0 : 10 }) },
    researchMcpUsage: { findUnique: async () => ({ used: block === "zero_quota" ? 0 : 10 }) },
  };
  t.mock.method(prisma, "$transaction", async (work: (tx: typeof gate) => unknown) => work(gate));
  for (const [cause, code, reason, seconds] of [
    ["lock", "BUSY", "admission_contention", 1],
    ["rate", "RATE_LIMITED", "request_rate", 16],
    ["concurrent", "ACCOUNT_BUSY", "account_concurrency", 2],
    ["service", "BUSY", "service_concurrency", 3],
    ["quota", "QUOTA_EXCEEDED", "monthly_quota", 432000],
    ["zero_quota", "QUOTA_EXCEEDED", "monthly_quota", null],
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
    if (cause === "quota" || cause === "zero_quota") {
      assert.equal(error.limit, cause === "quota" ? 10 : 0);
      assert.equal(error.remaining, 0);
      assert.equal(error.requestedPoints, 1);
      assert.equal(error.retryAt, cause === "quota" ? "2026-12-01T00:00:00.000Z" : null);
    }
  }
});

test("Pro compares DHI peers and event windows, and receives a real PNG over MCP", async t => {
  const imageRoot = await mkdtemp(join(tmpdir(), "mcp-chart-delivery-"));
  t.after(() => rm(imageRoot, { recursive: true }));
  const company = {
    symbol: "DHI", name: "D.R. Horton", cik: "882184", marketCap: 50e9,
    gicsSector: "Consumer Discretionary", gicsIndustryCode: "252010", gicsSubIndustry: "Homebuilding",
  };
  const peers = [
    company, { ...company, symbol: "WHR", gicsSubIndustry: "Household Appliances" },
    { ...company, symbol: "LEN", name: "Lennar" }, { ...company, symbol: "PHM", name: "PulteGroup" },
  ];
  t.mock.method(prisma.equitySecurity, "findUnique", async () => company);
  t.mock.method(prisma.equitySecurity, "findMany", async ({ where }: { where: { symbol?: { in: string[] } } }) =>
    peers.filter(row => where.symbol?.in.includes(row.symbol) ?? true));
  t.mock.method(prisma.equityFundamentalSnapshot, "findMany", async () => []);
  t.mock.method(prisma.equitySplit, "findMany", async () => []);
  t.mock.method(prisma.equityPriceCoverage, "findUnique", async () => null);
  t.mock.method(prisma.secFiling, "findMany", async () => [{
    accession: "0000882184-26-000119", form: "8-K", items: "2.02,9.01",
    filedAt: new Date("2026-10-29"), publishedAt: new Date("2026-10-29T12:00Z"),
    url: "https://www.sec.gov/Archives/edgar/data/882184/results.htm",
  }]);
  const dates = ["2026-10-28", "2026-10-29", "2026-10-30", "2026-11-02"];
  const returns = { DHI: 10, SPY: 1, LEN: 4, PHM: 8 };
  t.mock.method(prisma.equityDailyBar, "findMany", async ({ where }: { where: {
    symbol: string | { in: (keyof typeof returns)[] }; date: { gte: Date; lte: Date };
  } }) => {
    const tickers = typeof where.symbol === "string" ? [where.symbol as keyof typeof returns] : where.symbol.in;
    return tickers.flatMap(symbol => dates.flatMap((date, index) => {
      if (symbol === "PHM" && index === 2) return [];
      const close = 100 + (index === 3 ? returns[symbol] : index);
      return [{ symbol, date: new Date(date), close, adjClose: close, open: close - 1, high: close + 1, low: close - 2, volume: 12345 }];
    })).filter(row => row.date >= where.date.gte && row.date <= where.date.lte);
  });
  t.mock.method(prisma, "$queryRaw", async () => peers.map(row => ({ symbol: row.symbol, close: 100 })));
  const budget = {
    $queryRaw: async (strings: TemplateStringsArray) => strings[0]?.includes("pg_try_advisory")
      ? [{ locked: true }] : [{ now: new Date("2026-11-26") }],
    researchMcpCall: { deleteMany: async () => ({}), count: async () => 0, groupBy: async () => [], create: async () => ({}) },
    user: { findUnique: async () => ({ researchMcpMonthlyPoints: null }) },
    researchMcpUsage: { findUnique: async () => null, upsert: async () => ({}) },
  };
  t.mock.method(prisma, "$transaction", async (work: (tx: typeof budget) => unknown) => work(budget));
  t.mock.method(prisma.researchMcpCall, "updateMany", async () => ({ count: 1 }));
  const user: ResearchPrincipal = { ...paid, enabledFeatures: ["markets"] };
  const call = async (name: string, args: Record<string, unknown>) =>
    (await send("tools/call", { name, arguments: args }, user)).result;
  const input = { symbol: "DHI", startDate: dates[1], endDate: dates[3] };
  const comparison = (await call("compare_stock_peers", input)).structuredContent;
  assert.equal(comparison.peerClassification.name, "Homebuilding");
  assert.deepEqual(comparison.peerReturns.map((row: { symbol: string }) => row.symbol), ["LEN", "PHM"]);
  assert.equal(comparison.baselineDate, dates[0]);
  assert.ok(Math.abs(comparison.excessVsPeers - 0.04) < 1e-12);
  const [event] = (await call("get_stock_event_returns", input)).structuredContent.events;
  assert.deepEqual(event.tradingDates, dates.slice(1));
  assert.equal(event.windowBasis, "same_session_before_open");
  assert.ok(Math.abs(event.excessVsPeers - 0.06) < 1e-12);
  assert.equal(event.peerReturns[1].return, null);
  t.mock.method(process, "cwd", () => imageRoot);
  const image = await call("render_stock_chart_png", input);
  assert.equal(image.isError, false);
  assert.equal(image.structuredContent.bars, 3);
  assert.equal(image.structuredContent.events[0].date, dates[1]);
  assert.equal(Object.hasOwn(image.structuredContent, "image"), false);
  assert.equal(image.content[1].mimeType, "image/png");
  const png = Buffer.from(image.content[1].data, "base64");
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const { imageUrl, downloadUrl, imageExpiresAt } = image.structuredContent;
  assert.equal(image.content[2].type, "resource_link");
  assert.equal(image.content[2].uri, imageUrl);
  assert.ok(Date.parse(imageExpiresAt) > Date.now());
  const name = new URL(imageUrl).pathname.split("/").at(-1)!;
  const { GET } = await import("@/app/api/mcp/chart-images/[name]/route");
  const request = (url: string, value = name) => GET(new Request(url), { params: Promise.resolve({ name: value }) });
  const preview = await request(imageUrl);
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("content-type"), "image/png");
  assert.equal(preview.headers.get("content-disposition"), 'inline; filename="DHI-chart.png"');
  assert.equal(preview.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), png);
  const download = await request(downloadUrl);
  assert.equal(download.headers.get("content-disposition"), 'attachment; filename="DHI-chart.png"');
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
  assert.equal((await request(imageUrl, "../../not-an-image.txt")).status, 404);
  assert.equal((await request(imageUrl, name.replace("DHI", "LEN"))).status, 404);
  const expiryClock = t.mock.method(Date, "now", () => Date.parse(imageExpiresAt) + 1000);
  try {
    assert.equal((await request(imageUrl)).status, 404);
  } finally {
    expiryClock.mock.restore();
  }
  const evidence = { url: "https://example.org/official-release", note: "Primary source" };
  const researchEvent = {
    title: "Research catalyst", content: "Verified public announcement", occurredAt: "2026-10-31T11:30:00-04:00",
    datePrecision: "DATETIME", eventType: "company.product", markerLabel: "Launch", sources: [evidence],
    payload: { impact: { summary: "Potential demand change", channels: ["demand"] } },
  };
  const eventPack = {
    pack: { id: "dhi-test", name: "DHI research test", color: "#13579B" },
    events: [
      { ...researchEvent, externalId: "in-range" },
      { ...researchEvent, externalId: "crosses-utc-date", occurredAt: "2026-10-29T23:30:00-04:00" },
      { ...researchEvent, externalId: "outside", occurredAt: "2026-10-27", datePrecision: "DATE" },
    ],
  };
  const eventChart = await call("render_stock_event_pack_chart", { ...input, eventPack });
  assert.equal(eventChart.isError, false, JSON.stringify(eventChart.structuredContent));
  const { researchEvents, plottedEventCount, eventPackDownloadUrl } = eventChart.structuredContent;
  assert.equal(plottedEventCount, 2);
  assert.deepEqual(researchEvents.map((row: { externalId: string; number: number | null; status: string; candleDate: string | null }) =>
    [row.externalId, row.number, row.status, row.candleDate]), [
    ["outside", null, "out_of_range", null],
    ["crosses-utc-date", 1, "plotted", "2026-10-30"],
    ["in-range", 2, "plotted", "2026-11-02"],
  ]);
  assert.equal(researchEvents[1].occurredAt, "2026-10-29T23:30:00-04:00");
  assert.equal(researchEvents[1].color, "#13579B");
  assert.deepEqual(researchEvents[1].evidenceUrls, [evidence.url]);
  assert.equal(eventChart.content[1].mimeType, "image/png");
  assert.equal(eventChart.content[3].uri, eventPackDownloadUrl);
  assert.equal(eventChart.content[3].mimeType, "application/json");
  const eventPng = Buffer.from(eventChart.content[1].data, "base64");
  assert.equal(eventPng.readUInt32BE(16), 1200);
  assert.equal(eventPng.readUInt32BE(20), 640);
  const unmarked = await call("render_stock_chart_png", { ...input, showEarnings: false });
  assert.notDeepEqual(eventPng, Buffer.from(unmarked.content[1].data, "base64"));
  const eventFile = await request(eventPackDownloadUrl, new URL(eventPackDownloadUrl).pathname.split("/").at(-1));
  assert.equal(eventFile.status, 200);
  assert.equal(eventFile.headers.get("content-type"), "application/json");
  assert.equal(eventFile.headers.get("content-disposition"), 'attachment; filename="DHI-events.json"');
  const eventDocument = await eventFile.json();
  assert.equal(eventDocument.schemaVersion, 2);
  assert.deepEqual(eventDocument.pack.symbols, ["DHI"]);
  assert.deepEqual(eventDocument.events[1].sources, [evidence]);
  assert.equal(eventDocument.events[1].sourceUrl, evidence.url);
  assert.equal(eventDocument.events[2].occurredAt, researchEvent.occurredAt);
  const { parseMilestoneIngestJson } = await import("@/lib/equity/companyMilestones");
  const reparsed = parseMilestoneIngestJson(eventDocument);
  assert.deepEqual(reparsed.errors, []);
  assert.equal(reparsed.milestones.length, 3);
  const { validateIngestRun } = await import("@/lib/data/marketEventsIngest");
  assert.equal(validateIngestRun(eventDocument).ok, true);
  const expiry = t.mock.method(Date, "now", () => Date.parse(eventChart.structuredContent.eventPackExpiresAt) + 1000);
  try {
    assert.equal((await request(eventPackDownloadUrl, new URL(eventPackDownloadUrl).pathname.split("/").at(-1))).status, 404);
  } finally {
    expiry.mock.restore();
  }
  const weekly = await call("render_stock_event_pack_chart", { ...input, interval: "1w", eventPack });
  assert.equal(weekly.structuredContent.researchEvents[1].candleDate, "2026-10-26");
  assert.equal(weekly.structuredContent.researchEvents[2].candleDate, "2026-11-02");
  const invalidScope = await call("render_stock_event_pack_chart", {
    ...input, eventPack: { ...eventPack, pack: { ...eventPack.pack, symbols: ["LEN"] } },
  });
  assert.equal(invalidScope.isError, true);
  assert.match(invalidScope.structuredContent.error.message, /显示范围未包含当前标的/);
  const duplicate = await call("render_stock_event_pack_chart", {
    ...input, eventPack: { ...eventPack, events: [eventPack.events[0], eventPack.events[0]] },
  });
  assert.equal(duplicate.structuredContent.error.code, "INVALID_INPUT");
  assert.match(duplicate.structuredContent.error.message, /externalId 重复/);
  const deniedChart = await send("tools/call", { name: "render_stock_event_pack_chart", arguments: { ...input, eventPack } }, paid);
  assert.equal(deniedChart.result.isError, true);

  const denied = await send("tools/call", { name: "render_stock_chart_png", arguments: input }, paid);
  assert.equal(denied.result.isError, true);
});

test("date-only earnings windows skip the holiday and keep the same baseline for all securities", async () => {
  const { stockEventWindow } = await import("./stockMarket");
  const window = stockEventWindow({ date: "2026-11-25" }, 2, []);
  assert.deepEqual(window.dates, ["2026-11-25", "2026-11-27", "2026-11-30"]);
  assert.equal(window.session, "unknown");
  assert.equal(window.windowBasis, "sessions_strictly_after_event_date");
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
