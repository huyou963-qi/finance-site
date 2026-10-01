import assert from "node:assert/strict";
import { test } from "node:test";
import { handleWeeklyReportMcp } from "./weeklyReportMcp";

const fixtureCredential = "fixture-only-not-a-production-credential";
const options = { expectedToken: fixtureCredential };
const args = {
  meta: {
    weekEnding: "2026-09-25", title: "测试周报", regime: "测试", regimeConfidence: "L",
    scope: "测试夹具", generatedAt: "2026-10-01T03:36:00Z", summaryOneLiner: "测试摘要",
    kpis: [{ label: "测试指标", value: "1", delta: "0", dir: "flat" }],
  },
  bodyMarkdown: "# 测试夹具\n完整正文只用于 mock，不向网站发布。",
};
function request(message: unknown, headers: Record<string, string> = {}, method = "POST") {
  return new Request("https://gekkotech.cn/api/weekly-reports/mcp", {
    method,
    headers: { Authorization: "Bearer " + fixtureCredential, "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
    ...(method === "POST" ? { body: JSON.stringify(message) } : {}),
  });
}
function call(argumentsValue: unknown = args, name = "publishWeeklyMarketReport") {
  return { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: argumentsValue } };
}

test("MCP fails closed for absent, old, and non-Bearer credentials", async () => {
  for (const authorization of ["", "Bearer previous-fixture", fixtureCredential]) {
    const r = await handleWeeklyReportMcp(request(call(), { Authorization: authorization }), options);
    assert.equal(r.status, 401);
    assert.ok(!(await r.text()).includes(fixtureCredential));
  }
  const r = await handleWeeklyReportMcp(request(call()), { expectedToken: undefined });
  assert.equal(r.status, 503);
});

test("origin and HTTP transport are restricted", async () => {
  assert.equal((await handleWeeklyReportMcp(request(call(), { Origin: "https://untrusted.invalid" }), options)).status, 403);
  assert.equal((await handleWeeklyReportMcp(request({}, {}, "GET"), options)).status, 405);
  assert.equal((await handleWeeklyReportMcp(request({}, {}, "DELETE"), options)).status, 405);
  assert.equal((await handleWeeklyReportMcp(request({}, { "Content-Type": "text/plain" }), options)).status, 415);
  assert.equal((await handleWeeklyReportMcp(request({}, { Accept: "text/html" }), options)).status, 406);
  assert.equal((await handleWeeklyReportMcp(request({}, { "MCP-Protocol-Version": "invalid" }), options)).status, 400);
});

test("initialize, ping and tool discovery expose exactly one write tool", async () => {
  const init = await handleWeeklyReportMcp(request({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } }), options);
  assert.equal((await init.json()).result.protocolVersion, "2025-06-18");
  const r = await handleWeeklyReportMcp(request({ jsonrpc: "2.0", id: 2, method: "tools/list" }), options);
  const tools = (await r.json()).result.tools;
  assert.deepEqual(tools.map((t: { name: string }) => t.name), ["publishWeeklyMarketReport"]);
  assert.deepEqual(tools[0].inputSchema.required, ["meta", "bodyMarkdown"]);
  assert.equal(tools[0].annotations.readOnlyHint, false);
  const ping = await handleWeeklyReportMcp(request({ jsonrpc: "2.0", id: 3, method: "ping" }), options);
  assert.deepEqual((await ping.json()).result, {});
});

test("notifications cannot cause writes; unsupported methods and tools fail", async () => {
  const notification = await handleWeeklyReportMcp(request({ jsonrpc: "2.0", method: "notifications/initialized" }), options);
  assert.equal(notification.status, 202);
  assert.equal(await notification.text(), "");
  assert.equal((await handleWeeklyReportMcp(request({ ...call(), id: undefined }), options)).status, 400);
  const unsupported = await handleWeeklyReportMcp(request({ jsonrpc: "2.0", id: 1, method: "resources/list" }), options);
  assert.equal((await unsupported.json()).error.code, -32601);
  const wrongTool = await handleWeeklyReportMcp(request(call(args, "deleteReport")), options);
  assert.equal((await wrongTool.json()).error.code, -32602);
});

test("reject incomplete/invalid reports and caller-supplied destinations before fetch", async () => {
  const fetcher: typeof fetch = async () => { throw new Error("must not fetch"); };
  for (const invalid of [
    {}, { ...args, bodyMarkdown: " " }, { ...args, url: "https://untrusted.invalid" },
    { ...args, meta: { ...args.meta, kpis: [] } },
    { ...args, meta: { ...args.meta, weekEnding: "2026-02-30" } },
    { ...args, meta: { ...args.meta, generatedAt: "yesterday" } },
    { ...args, meta: { ...args.meta, regimeConfidence: "high" } },
  ]) {
    const r = await handleWeeklyReportMcp(request(call(invalid)), { ...options, fetcher });
    assert.equal((await r.json()).error.code, -32602);
  }
});

test("oversized and malformed JSON are rejected without publication", async () => {
  const huge = await handleWeeklyReportMcp(request(call({ ...args, bodyMarkdown: "x".repeat(1024 * 1024) })), options);
  assert.equal(huge.status, 413);
  const malformed = new Request("https://gekkotech.cn/api/weekly-reports/mcp", { method: "POST", headers: { Authorization: "Bearer " + fixtureCredential, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: "{" });
  assert.equal((await handleWeeklyReportMcp(malformed, options)).status, 400);
});

test("publish forwards full payload only to the fixed API and returns actual 200/201 receipt", async () => {
  for (const status of [200, 201]) {
    let calls = 0;
    const fetcher: typeof fetch = async (url, init) => {
      calls++;
      assert.equal(url, "https://gekkotech.cn/api/weekly-reports");
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "error");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer " + fixtureCredential);
      assert.deepEqual(JSON.parse(String(init?.body)), args);
      return Response.json({ id: "fixture-report-id", weekEnding: args.meta.weekEnding, report: args }, { status });
    };
    const r = await handleWeeklyReportMcp(request(call()), { ...options, fetcher });
    const payload = await r.json();
    assert.equal(calls, 1);
    assert.deepEqual(payload.result.structuredContent, { httpStatus: status, id: "fixture-report-id", weekEnding: "2026-09-25" });
    assert.ok(!JSON.stringify(payload).includes(fixtureCredential));
    assert.ok(!JSON.stringify(payload).includes(args.bodyMarkdown));
  }
});

test("upstream failures are not echoed or reported as success", async () => {
  for (const status of [302, 401, 422, 500]) {
    const fetcher: typeof fetch = async () => new Response("private upstream detail", { status });
    const r = await handleWeeklyReportMcp(request(call()), { ...options, fetcher });
    const payload = await r.json();
    assert.equal(payload.result.isError, true);
    assert.equal(JSON.parse(payload.result.content[0].text).httpStatus, status);
    assert.ok(!JSON.stringify(payload).includes("private upstream detail"));
  }
});

test("missing and mismatched publication receipts are failures", async () => {
  for (const receipt of [{}, { id: "id", weekEnding: "2026-09-18" }]) {
    const fetcher: typeof fetch = async () => Response.json(receipt, { status: 201 });
    const r = await handleWeeklyReportMcp(request(call()), { ...options, fetcher });
    assert.equal((await r.json()).result.isError, true);
  }
});

test("network exceptions stay private and leave outcome explicitly unconfirmed", async () => {
  const fetcher: typeof fetch = async () => { throw new Error(fixtureCredential); };
  const r = await handleWeeklyReportMcp(request(call()), { ...options, fetcher });
  const payload = await r.json();
  assert.equal(payload.result.isError, true);
  assert.equal(JSON.parse(payload.result.content[0].text).httpStatus, null);
  assert.ok(!JSON.stringify(payload).includes(fixtureCredential));
});
