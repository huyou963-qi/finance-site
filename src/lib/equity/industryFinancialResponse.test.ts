import { test } from "node:test";
import assert from "node:assert/strict";
import { readIndustryFinancialResponse } from "./industryFinancialResponse";

test("行业响应：网关 HTML 502 展示可重试服务提示，JSON 错误保留业务说明", async () => {
  await assert.rejects(readIndustryFinancialResponse(new Response("<html>bad gateway</html>", {
    status: 502, headers: { "content-type": "text/html" },
  })), /暂时不可用.*502/);
  await assert.rejects(readIndustryFinancialResponse(Response.json({ error: "行业不存在" }, { status: 404 })), /行业不存在/);
  await assert.rejects(readIndustryFinancialResponse(new Response("<html>", { headers: { "content-type": "application/json" } })), /响应异常/);
  assert.deepEqual(await readIndustryFinancialResponse(Response.json({ etf: "XLC" })), { etf: "XLC" });
});
