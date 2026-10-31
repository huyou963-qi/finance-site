import { ProxyAgent } from "undici";

let cached: { url: string; agent: ProxyAgent } | undefined;

/** Annual WDI history fits one bounded page. Keep query order stable: some
 * upstream/CDN paths return 502 for date-filtered or reordered queries. */
export async function fetchWorldBankHistory(country: string, indicator: string): Promise<unknown[]> {
  if (!/^[A-Z]{2,3}$/.test(country) || !/^[A-Z0-9_.]+$/.test(indicator)) throw new Error("Invalid World Bank series identity");
  const url = `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&per_page=100`;
  const configured = process.env.WORLD_BANK_PROXY_URL?.trim();
  let agent: ProxyAgent | undefined;
  if (configured) {
    let proxy: URL;
    try { proxy = new URL(configured); } catch { throw new Error("Invalid WORLD_BANK_PROXY_URL"); }
    if (!["http:", "https:"].includes(proxy.protocol)) throw new Error("WORLD_BANK_PROXY_URL requires http(s)");
    if (cached?.url !== proxy.href) {
      if (cached) void cached.agent.close().catch(() => undefined);
      cached = { url: proxy.href, agent: new ProxyAgent(proxy.href) };
    }
    agent = cached.agent;
  }
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(45_000), redirect: "error",
      ...(agent ? { dispatcher: agent } : {}) } as RequestInit);
  } catch { throw new Error("World Bank transport failed (timeout, network or configured proxy unavailable)"); }
  if (!response.ok) throw new Error(`World Bank HTTP ${response.status}`);
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new Error("World Bank response is not JSON"); }
  if (!Array.isArray(payload) || !Array.isArray(payload[1]) || payload[1].length > 100
    || (payload[0]?.pages !== undefined && payload[0].pages !== 1)) {
    throw new Error("World Bank response schema/pagination changed; refusing partial history");
  }
  return payload[1];
}
