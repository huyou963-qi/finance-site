import type { NextRequest } from "next/server";

export class SameOriginError extends Error {
  readonly status = 403;
  readonly code = "INVALID_ORIGIN";
  constructor(message = "请从本站页面操作") {
    super(message);
    this.name = "SameOriginError";
  }
}

function parseAliasOrigin(raw: string): string {
  const url = new URL(raw);
  if (url.username || url.password) throw new SameOriginError("跨站来源白名单配置无效");
  if (url.origin !== raw) throw new SameOriginError("跨站来源白名单配置无效");
  return url.origin;
}

function allowedOriginsFor(req: NextRequest): Set<string> {
  const expected = new URL(process.env.APP_BASE_URL || req.url).origin;
  const requestOrigin = req.nextUrl.origin;
  const rawAliases = [
    ...(process.env.ALLOWED_ORIGINS ?? "").split(","),
    ...(process.env.BILLING_ALLOWED_ORIGINS ?? "").split(","),
  ]
    .map((v) => v.trim())
    .filter(Boolean);
  const aliases: string[] = [];
  for (const raw of rawAliases) {
    aliases.push(parseAliasOrigin(raw));
  }
  return new Set([expected, requestOrigin, ...aliases]);
}

/**
 * 写操作同源校验（复用 billing 思路）。
 * 允许：APP_BASE_URL、当前请求 origin、ALLOWED_ORIGINS、BILLING_ALLOWED_ORIGINS。
 * 生产别名建议仅 https；本地开发可用 http://localhost。
 */
export function requireSameOrigin(req: NextRequest): void {
  const origin = req.headers.get("origin");
  let allowed: Set<string>;
  try {
    allowed = allowedOriginsFor(req);
  } catch {
    throw new SameOriginError("跨站来源白名单配置无效");
  }
  if (!origin || !allowed.has(origin)) throw new SameOriginError();
}

/**
 * 埋点 beacon 友好的同源判断：优先 Origin；缺失时接受本站 Referer
 * （部分浏览器 sendBeacon 不带 Origin）。
 */
export function isAllowedAnalyticsOrigin(req: NextRequest): boolean {
  let allowed: Set<string>;
  try {
    allowed = allowedOriginsFor(req);
  } catch {
    return false;
  }
  const origin = req.headers.get("origin");
  if (origin) return allowed.has(origin);

  const referer = req.headers.get("referer");
  if (!referer) return false;
  try {
    return allowed.has(new URL(referer).origin);
  } catch {
    return false;
  }
}

export function sameOriginErrorResponse(error: unknown): { error: string; status: number } | null {
  if (error instanceof SameOriginError) {
    return { error: error.message, status: error.status };
  }
  return null;
}
