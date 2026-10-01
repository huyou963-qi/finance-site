import { createHash, timingSafeEqual } from "node:crypto";

const ENDPOINT = "https://gekkotech.cn/api/weekly-reports";
const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const MAX_BYTES = 1024 * 1024;
const textField = { type: "string", minLength: 1 };
const metaSchema = {
  type: "object",
  additionalProperties: false,
  required: ["weekEnding", "title", "regime", "regimeConfidence", "scope", "generatedAt", "summaryOneLiner", "kpis"],
  properties: {
    weekEnding: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    title: textField, regime: textField, scope: textField,
    regimeConfidence: { type: "string", enum: ["H", "M", "L"] },
    generatedAt: { type: "string", format: "date-time" },
    summaryOneLiner: textField,
    kpis: {
      type: "array", minItems: 1,
      items: {
        type: "object", additionalProperties: false,
        required: ["label", "value", "delta", "dir"],
        properties: { label: textField, value: textField, delta: textField, dir: { type: "string", enum: ["up", "down", "flat"] } },
      },
    },
  },
};
export const weeklyReportTool = {
  name: "publishWeeklyMarketReport",
  title: "发布 GekkoTech 周度市场报告",
  description: "仅向 https://gekkotech.cn/api/weekly-reports 发布完整 meta 和 bodyMarkdown；按 weekEnding 创建或更新。返回真实上游 HTTP 状态、id 和 weekEnding。",
  inputSchema: {
    type: "object", additionalProperties: false,
    required: ["meta", "bodyMarkdown"],
    properties: { meta: metaSchema, bodyMarkdown: textField },
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
};

type Options = { expectedToken: string | undefined; fetcher?: typeof fetch };
type RpcId = string | number | null;
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function validArguments(value: unknown): value is { meta: Record<string, unknown>; bodyMarkdown: string } {
  if (!object(value) || !exactKeys(value, ["meta", "bodyMarkdown"]) || !nonempty(value.bodyMarkdown) || !object(value.meta)) return false;
  const m = value.meta;
  if (!exactKeys(m, ["weekEnding", "title", "regime", "regimeConfidence", "scope", "generatedAt", "summaryOneLiner", "kpis"])) return false;
  if (!["weekEnding", "title", "regime", "scope", "generatedAt", "summaryOneLiner"].every((key) => nonempty(m[key]))) return false;
  if (!["H", "M", "L"].includes(String(m.regimeConfidence))) return false;
  const week = String(m.weekEnding);
  const date = new Date(week + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== week) return false;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(String(m.generatedAt)) || !Number.isFinite(Date.parse(String(m.generatedAt)))) return false;
  return Array.isArray(m.kpis) && m.kpis.length > 0 && m.kpis.every((k) =>
    object(k) && exactKeys(k, ["label", "value", "delta", "dir"]) &&
    ["label", "value", "delta"].every((key) => nonempty(k[key])) &&
    ["up", "down", "flat"].includes(String(k.dir)));
}
function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...extra } });
}
function error(id: RpcId, code: number, message: string, status = 200) {
  return json({ jsonrpc: "2.0", id, error: { code, message } }, status);
}
function result(id: RpcId, value: unknown) {
  return json({ jsonrpc: "2.0", id, result: value });
}
function toolFailure(id: RpcId, httpStatus: number | null, message: string) {
  return result(id, {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ httpStatus, error: message }) }],
  });
}
async function readBody(req: Request) {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

// No request, credential, report body, upstream error, or exception is logged.
export async function handleWeeklyReportMcp(req: Request, options: Options): Promise<Response> {
  const origin = req.headers.get("origin");
  if (origin !== null && origin !== "https://gekkotech.cn") return json({ error: "Origin 不允许" }, 403);
  const expected = options.expectedToken?.trim();
  if (!expected) return json({ error: "发布服务尚未配置" }, 503);
  const authorization = req.headers.get("authorization") ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(authorization), digest("Bearer " + expected))) {
    return json({ error: "需要有效 Bearer 凭证" }, 401, { "WWW-Authenticate": 'Bearer realm="weekly-report-publisher"' });
  }
  if (req.method !== "POST") return json({ error: "仅支持 POST" }, 405, { Allow: "POST" });
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "需要 application/json" }, 415);
  const accept = req.headers.get("accept") ?? "";
  if (!accept.includes("application/json") || !accept.includes("text/event-stream")) return json({ error: "需要 MCP Accept 内容类型" }, 406);
  const version = req.headers.get("mcp-protocol-version");
  if (version && !VERSIONS.includes(version)) return error(null, -32600, "不支持的 MCP 协议版本", 400);
  let message: unknown;
  try {
    const raw = await readBody(req);
    if (raw === null) return json({ error: "请求过大" }, 413);
    message = JSON.parse(raw);
  } catch { return error(null, -32700, "无效 JSON", 400); }
  if (!object(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") return error(null, -32600, "无效 JSON-RPC 请求", 400);
  const hasId = Object.hasOwn(message, "id");
  if (hasId && typeof message.id !== "string" && typeof message.id !== "number") return error(null, -32600, "无效请求 id", 400);
  if (!hasId) {
    if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });
    return error(null, -32600, "仅接受协议通知；工具调用需要 id", 400);
  }
  const id = message.id as string | number;
  const params = object(message.params) ? message.params : {};
  switch (message.method) {
    case "initialize":
      if (typeof params.protocolVersion !== "string" || !object(params.capabilities) || !object(params.clientInfo)) return error(id, -32602, "无效初始化参数");
      return result(id, {
        protocolVersion: VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "gekkotech-weekly-report-publisher", version: "1.0.0" },
      });
    case "ping": return result(id, {});
    case "tools/list": return result(id, { tools: [weeklyReportTool] });
    case "tools/call": {
      if (params.name !== weeklyReportTool.name) return error(id, -32602, "不支持的工具");
      if (!validArguments(params.arguments)) return error(id, -32602, "需要完整且有效的 meta 和 bodyMarkdown");
      try {
        // Fixed host/path/method; redirects are refused so credentials cannot leave this endpoint.
        const upstream = await (options.fetcher ?? fetch)(ENDPOINT, {
          method: "POST", redirect: "error", cache: "no-store",
          headers: { "Content-Type": "application/json", Authorization: authorization },
          body: JSON.stringify(params.arguments),
          signal: AbortSignal.timeout(30_000),
        });
        if (upstream.status !== 200 && upstream.status !== 201) return toolFailure(id, upstream.status, "周报接口未确认发布成功");
        const payload: unknown = await upstream.json();
        if (!object(payload) || !nonempty(payload.id) || payload.weekEnding !== params.arguments.meta.weekEnding) return toolFailure(id, upstream.status, "周报接口未返回匹配的 id 与 weekEnding");
        const published = { httpStatus: upstream.status, id: payload.id, weekEnding: payload.weekEnding };
        return result(id, { content: [{ type: "text", text: JSON.stringify(published) }], structuredContent: published });
      } catch { return toolFailure(id, null, "发布请求失败或结果无法确认；检查后使用同一 weekEnding 重试"); }
    }
    default: return error(id, -32601, "不支持的方法");
  }
}
