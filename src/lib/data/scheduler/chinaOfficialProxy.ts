import { ProxyAgent } from "undici";

const CHINA_OFFICIAL_HOSTS = new Set([
  "gks.mof.gov.cn",
  "data.stats.gov.cn",
  "www.stats.gov.cn",
  "www.pbc.gov.cn",
  "www.safe.gov.cn",
  "data.mofcom.gov.cn",
  "fdi.mofcom.gov.cn",
]);

let cachedProxyUrl: string | null | undefined;
let cachedAgent: ProxyAgent | null = null;
let proxyLogged = false;

function proxyUrl(): string | null {
  if (cachedProxyUrl !== undefined) return cachedProxyUrl;
  const configured = process.env.CHINA_OFFICIAL_PROXY_URL?.trim();
  if (!configured) return (cachedProxyUrl = null);
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("CHINA_OFFICIAL_PROXY_URL 必须是有效的 http(s) 代理 URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("CHINA_OFFICIAL_PROXY_URL 仅支持 http:// 或 https:// 代理");
  }
  return (cachedProxyUrl = parsed.toString());
}

export function isChinaOfficialUrl(input: string | URL): boolean {
  const hostname = new URL(input).hostname.toLowerCase();
  return CHINA_OFFICIAL_HOSTS.has(hostname) || hostname.endsWith(".stats.gov.cn") || hostname.endsWith(".pbc.gov.cn") || hostname.endsWith(".safe.gov.cn") || hostname.endsWith(".mofcom.gov.cn");
}

/**
 * 只让已列入白名单的中国官方统计网站请求经过大陆 HTTP CONNECT 代理。
 * 未配置时严格保持原有直连行为；FRED、GitHub、网站流量不会受影响。
 */
export async function fetchChinaOfficial(input: string | URL, init?: RequestInit): Promise<Response> {
  const proxy = proxyUrl();
  if (!proxy || !isChinaOfficialUrl(input)) return fetch(input, init);
  cachedAgent ??= new ProxyAgent(proxy);
  if (!proxyLogged) {
    console.info("[china-official-proxy] 已启用大陆代理，仅用于已配置的中国官方统计网站请求");
    proxyLogged = true;
  }
  try {
    return await fetch(input, { ...init, dispatcher: cachedAgent } as RequestInit);
  } catch (error) {
    const host = new URL(input).hostname;
    throw new Error(`中国官方代理请求失败 (${host})：${error instanceof Error ? error.message : String(error)}`);
  }
}
