import assert from "node:assert/strict";
import test from "node:test";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { parseResearchScopes, personalReadScope, personalWriteScope, requireResearchEntitlement, researchScope, type ResearchPrincipal } from "./oauth";
import { createResearchMcpServer } from "./tools";

const paid: ResearchPrincipal = {
  id: "test", username: "test", role: "user", plan: "pro",
  planExpiresAt: new Date("2099-01-01"), trialEndsAt: null, creditBalance: 0,
  enabledFeatures: ["macro", "equity-stock-data"], scopes: [researchScope],
};

test("AI access uses the current subscription, independent of trial and backtest credits", () => {
  assert.equal(requireResearchEntitlement(paid), paid);
  assert.throws(() => requireResearchEntitlement({
    ...paid, plan: "standard", trialEndsAt: new Date("2099-01-01"), creditBalance: 100,
  }), { code: "pro_required" });
  assert.throws(() => requireResearchEntitlement({ ...paid, planExpiresAt: new Date(0) }), { code: "pro_required" });
  assert.throws(() => requireResearchEntitlement(null), { code: "invalid_token" });
});

test("SDK discovery exposes separate personal scopes and enforces them before queries", async () => {
  async function send(method: string, params?: unknown, user = paid) {
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
  const { result } = await send("tools/list");
  assert.deepEqual(result.tools.map((tool: { name: string }) => tool.name), [
    "get_usage", "search_market_indicators", "query_macro_data", "calculate_macro_series",
    "search_system_charts", "search_securities", "search_stock_indicators", "query_stock_data",
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
    "get_usage", "get_stock_disclosures", "get_stock_guidance", "get_stock_insider_filings",
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
