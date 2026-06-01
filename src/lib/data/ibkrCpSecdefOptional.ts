/**
 * TWS 模式下可选使用 CP Gateway secdef（仅当已配置 Cookie/URL），
 * 用于解析历史交割月 conid，避免 TWS 对过期 FUT 返回 200「未找到证券定义」。
 */
import { Agent, fetch as undiciFetch } from "undici";
import { cpBaseUrl, cpUnauthorizedHint } from "@/lib/data/ibkrCpFetch";
import { readIbkrCpCookie } from "@/lib/data/ibkrCpSession";

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

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function isCpSecdefAvailable(): boolean {
  return Boolean(readIbkrCpCookie() || process.env.IBKR_CP_BASE_URL?.trim());
}

async function cpFetchOptional(
  path: string,
  init?: RequestInit,
): Promise<Response | null> {
  if (!isCpSecdefAvailable()) return null;
  const url = `${cpApiRoot()}${path.startsWith("/") ? "" : "/"}${path}`;
  const insecure = cpTlsInsecure();
  const dispatcher = insecure
    ? new Agent({ connect: { rejectUnauthorized: false } })
    : undefined;
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  const cookie = readIbkrCpCookie();
  if (cookie) headers.Cookie = cookie;
  try {
    const res = await undiciFetch(url, {
      method: init?.method,
      signal: init?.signal,
      headers,
      dispatcher,
    });
    return res as unknown as Response;
  } catch {
    return null;
  }
}

/** 解析交割月 FUT 的 conid（需 Gateway 已登录且 Cookie/URL 可用） */
export async function tryResolveFutConidViaCp(
  root: string,
  ibMonth: string,
  exchange: string,
): Promise<{ conid: number; exchange: string } | null> {
  const sym = root.trim().toUpperCase();
  const searchRes = await cpFetchOptional(
    `/iserver/secdef/search?symbol=${encodeURIComponent(sym)}&secType=FUT`,
  );
  if (!searchRes?.ok) return null;
  const searchJson: unknown = await searchRes.json().catch(() => null);
  let underlyingConid = 0;
  if (Array.isArray(searchJson)) {
    for (const row of searchJson) {
      if (!row || typeof row !== "object") continue;
      const c = num((row as Record<string, unknown>).conid);
      if (c) {
        underlyingConid = c;
        break;
      }
    }
  }
  if (!underlyingConid) return null;

  const qs = new URLSearchParams({
    conid: String(underlyingConid),
    secType: "FUT",
    month: ibMonth,
  });
  if (exchange.trim()) qs.set("exchange", exchange.trim());
  const infoRes = await cpFetchOptional(
    `/iserver/secdef/info?${qs.toString()}`,
  );
  if (infoRes?.status === 401 || infoRes?.status === 403) {
    throw new Error(cpUnauthorizedHint());
  }
  if (!infoRes?.ok) return null;
  const infoJson: unknown = await infoRes.json().catch(() => null);
  if (!Array.isArray(infoJson) || !infoJson.length) return null;
  const row = infoJson[0] as Record<string, unknown>;
  const conid = num(row.conid);
  if (!conid) return null;
  const ex = String(row.listingExchange ?? row.exchange ?? exchange).trim();
  return { conid, exchange: ex || exchange };
}
