import { Agent, fetch as undiciFetch } from "undici";
import { isIbkrTwsMode } from "@/lib/data/ibkrApiConfig";
import { readIbkrCpCookie } from "@/lib/data/ibkrCpSession";

/**
 * Gateway 根 URL（无 `/v1/api` 后缀）。未配置时与 IB CPAPI 教程一致：`https://localhost:5000`。
 * 若你本机浏览器登录的是其他端口（常见 5099），设 `IBKR_CP_BASE_URL`。
 */
export function cpBaseUrl(): string {
  const raw =
    process.env.IBKR_CP_BASE_URL?.trim() ||
    process.env.IBKR_GATEWAY_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return "https://localhost:5000";
}

/**
 * 与教程里 `requests.get(..., verify=False)` 一致：本机 Gateway 多为自签名证书。
 * - `IBKR_CP_INSECURE_TLS=1`：强制跳过校验
 * - `IBKR_CP_INSECURE_TLS=0`：强制校验（本机已信任证书时用）
 * - 未设置且 host 为 localhost / 127.0.0.1：默认跳过（等同 demo 不写 env）
 */
function cpTlsInsecure(): boolean {
  const flag = process.env.IBKR_CP_INSECURE_TLS?.trim();
  if (flag === "1") return true;
  if (flag === "0") return false;
  try {
    const h = new URL(cpBaseUrl()).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1";
  } catch {
    return false;
  }
}

function cpApiRoot(): string {
  return `${cpBaseUrl()}/v1/api`;
}

/** 与 IB 教程一致：先浏览器登录本机 Gateway；Node 服务端有时仍需 Cookie */
export function cpUnauthorizedHint(): string {
  return "IBKR Client Portal 未授权：请先在本机浏览器登录 Gateway（与官方 Python 教程相同）。若本站服务端请求仍被拒绝，再设置 IBKR_CP_COOKIE 或使用 /api/ibkr/setup-cookie。";
}

export async function cpFetch(
  pathOrUrl: string,
  init?: RequestInit & { jsonBody?: unknown },
): Promise<globalThis.Response> {
  if (isIbkrTwsMode()) {
    throw new Error(
      "当前为 IBKR_API_MODE=tws，不应调用 Client Portal API。请将 IBKR_API_MODE 设为 cp 并配置 Gateway，或改用 TWS 对应功能。",
    );
  }
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${cpApiRoot()}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
  const insecure = cpTlsInsecure();
  const dispatcher = insecure
    ? new Agent({ connect: { rejectUnauthorized: false } })
    : undefined;

  const {
    jsonBody,
    body: initBody,
    ...rest
  } = (init ?? {}) as RequestInit & { jsonBody?: unknown };
  const headers: Record<string, string> = {
    ...(rest.headers as Record<string, string>),
  };
  const cookie = readIbkrCpCookie();
  if (cookie) headers["Cookie"] = cookie;

  let body: string | undefined;
  if (jsonBody !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(jsonBody);
  } else if (initBody != null && typeof initBody === "string") {
    body = initBody;
  }

  const res = await undiciFetch(url, {
    ...rest,
    method: rest.method ?? "GET",
    body,
    headers,
    dispatcher,
  });
  return res as unknown as globalThis.Response;
}
