import fs from "node:fs";
import { TE_ISM_PAGE_URL } from "./ismCatalog";

function defaultHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent":
      process.env.TRADINGECONOMICS_USER_AGENT?.trim() ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
  const cookie = process.env.TE_CALENDAR_COOKIE?.trim();
  if (cookie) h.Cookie = cookie;
  return h;
}

/** 抓取 TE 指标页 HTML */
export async function fetchTradingEconomicsIndicatorHtml(
  url: string,
): Promise<string> {
  const res = await fetch(url, {
    headers: defaultHeaders(),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`TE 指标页 HTTP ${res.status}: ${url}`);
  }
  return res.text();
}

export async function loadTradingEconomicsIndicatorHtml(options?: {
  url?: string;
  fixturePath?: string;
  defaultUrl?: string;
}): Promise<string> {
  const fixture = options?.fixturePath?.trim();
  if (fixture && fs.existsSync(fixture)) {
    return fs.readFileSync(fixture, "utf8");
  }
  const url = options?.url ?? options?.defaultUrl ?? TE_ISM_PAGE_URL;
  return fetchTradingEconomicsIndicatorHtml(url);
}

/** @deprecated 使用 loadTradingEconomicsIndicatorHtml */
export async function fetchTradingEconomicsIsmHtml(
  url = TE_ISM_PAGE_URL,
): Promise<string> {
  return fetchTradingEconomicsIndicatorHtml(url);
}

/** @deprecated 使用 loadTradingEconomicsIndicatorHtml */
export async function loadTradingEconomicsIsmHtml(options?: {
  url?: string;
  fixturePath?: string;
}): Promise<string> {
  return loadTradingEconomicsIndicatorHtml({
    ...options,
    defaultUrl: TE_ISM_PAGE_URL,
  });
}
