import { ProxyAgent } from "undici";
import { US_TRADE_FILES } from "./catalog";

const FILE_URLS = new Set<string>(Object.values(US_TRADE_FILES));
let cachedUrl: string | undefined;
let cachedAgent: ProxyAgent | undefined;

/** Shared HK → Synology HTTP CONNECT agent for audited Census surfaces.
 * Opt-in via CENSUS_FILE_PROXY_URL. Fail closed: never mask a broken tunnel by
 * retrying direct or consuming an old snapshot in the live connector. */
function censusProxyAgent(): ProxyAgent | undefined {
  const configured = process.env.CENSUS_FILE_PROXY_URL?.trim();
  if (!configured) return undefined;
  let proxy: URL;
  try { proxy = new URL(configured); } catch {
    throw new Error("CENSUS_FILE_PROXY_URL must be an http(s) proxy URL");
  }
  if (!["http:", "https:"].includes(proxy.protocol)) {
    throw new Error("CENSUS_FILE_PROXY_URL must use http:// or https://");
  }
  if (cachedUrl !== proxy.href || !cachedAgent) {
    if (cachedAgent) void cachedAgent.close().catch(() => undefined);
    cachedAgent = new ProxyAgent(proxy.href);
    cachedUrl = proxy.href;
  }
  return cachedAgent;
}

/** Exactly four audited FT-900 / balance workbooks. */
export async function fetchCensusTradeFile(input: string, init?: RequestInit): Promise<Response> {
  if (!FILE_URLS.has(input)) throw new Error("Census file transport: URL outside the four-file allowlist");
  const agent = censusProxyAgent();
  if (!agent) return fetch(input, { ...init, redirect: "error" });
  try {
    // Redirects must not expand the proxy's four-file scope.
    return await fetch(input, { ...init, redirect: "error", dispatcher: agent } as RequestInit);
  } catch {
    // Do not log proxy URLs, credentials, or nested transport error messages.
    throw new Error("Census official file proxy request failed (timeout, cancellation or tunnel unavailable)");
  }
}

/** Official intltrade partner API only. Same opt-in tunnel as the workbooks:
 * HK egress gets 403 from api.census.gov directly; the existing Synology proxy
 * returns 200. Unset proxy keeps direct fetch for non-HK environments. */
export async function fetchCensusPartnerApiHttp(input: string | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? new URL(input) : input;
  if (url.protocol !== "https:" || url.hostname !== "api.census.gov"
    || !url.pathname.startsWith("/data/timeseries/intltrade/")) {
    throw new Error("Census partner API transport: URL outside allowlist");
  }
  const agent = censusProxyAgent();
  if (!agent) return fetch(url, { ...init, redirect: "manual" });
  try {
    return await fetch(url, { ...init, redirect: "manual", dispatcher: agent } as RequestInit);
  } catch {
    throw new Error("Census partner API proxy request failed (timeout, cancellation or tunnel unavailable)");
  }
}
