import type { NextRequest } from "next/server";

export const REQUEST_ID_HEADER = "x-request-id";

const REQUEST_ID_RE = /^[A-Za-z0-9_.:-]{8,128}$/;

/** 从请求头读取合法 request id；缺失或不合法时返回 null。 */
export function readRequestId(req: NextRequest | Request): string | null {
  const raw = req.headers.get(REQUEST_ID_HEADER)?.trim() ?? "";
  if (!REQUEST_ID_RE.test(raw)) return null;
  return raw;
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

/** 优先沿用客户端/中间件传入的 id，否则新生成。 */
export function resolveRequestId(req: NextRequest | Request): string {
  return readRequestId(req) ?? newRequestId();
}
