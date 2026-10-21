import { ProxyAgent } from "undici";
import { US_TRADE_FILES } from "./catalog";

const FILE_URLS = new Set<string>(Object.values(US_TRADE_FILES));
let cachedUrl: string | undefined;
let cachedAgent: ProxyAgent | undefined;

/** Opt-in transport for exactly four audited Census workbooks, not the API
 * or arbitrary census.gov pages. Fail closed: never mask a broken tunnel by
 * retrying direct or consuming an old snapshot in the live connector. */
export async function fetchCensusTradeFile(input: string, init?: RequestInit): Promise<Response> {
  if (!FILE_URLS.has(input)) throw new Error("Census file transport: URL outside the four-file allowlist");
  const configured = process.env.CENSUS_FILE_PROXY_URL?.trim();
  if (!configured) return fetch(input, { ...init, redirect: "error" });
  let proxy: URL;
  try { proxy = new URL(configured); } catch {
    throw new Error("CENSUS_FILE_PROXY_URL must be an http(s) proxy URL");
  }
  if (!["http:", "https:"].includes(proxy.protocol)) {
    throw new Error("CENSUS_FILE_PROXY_URL must use http:// or https://");
  }
  if (cachedUrl !== proxy.href || !cachedAgent) {
    // Changing configuration is uncommon, but do not retain an obsolete agent.
    if (cachedAgent) void cachedAgent.close().catch(() => undefined);
    cachedAgent = new ProxyAgent(proxy.href);
    cachedUrl = proxy.href;
  }
  try {
    // Redirects must not expand the proxy's four-file scope.
    return await fetch(input, { ...init, redirect: "error", dispatcher: cachedAgent } as RequestInit);
  } catch {
    // Do not log proxy URLs, credentials, or nested transport error messages.
    throw new Error("Census official file proxy request failed (timeout, cancellation or tunnel unavailable)");
  }
}
