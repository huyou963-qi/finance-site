/**
 * PR Newswire 抓取客户端：ISM 新闻稿列表页 + 单篇新闻稿正文。
 *
 * 合规依据（写入 Spec §3.1）：PR Newswire 是 ISM 官方新闻稿发布渠道，公开可读、
 * 无需登录，robots.txt 对 /news/ 与 /news-releases/ 路径无 Disallow；抓取频率与
 * ISM 月度发布频率一致（月频 probe，非并发轰炸），仅在 ISM 官网月报不可达时兜底触发。
 */
import fs from "node:fs";
import { PR_NEWSWIRE_ISM_LIST_URL } from "../catalog";

const CACHE_MS = 60_000;
const cache = new Map<string, { html: string; at: number }>();

export class PrNewswireFetchError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "PrNewswireFetchError";
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

function defaultHeaders(): Record<string, string> {
  return {
    "User-Agent":
      process.env.ISM_USER_AGENT?.trim() ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
}

export async function fetchPrNewswireHtml(url: string): Promise<string> {
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && now - hit.at < CACHE_MS) return hit.html;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: defaultHeaders(),
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new PrNewswireFetchError(
      `PR Newswire 网络请求失败：${url}（${err instanceof Error ? err.message : String(err)}）`,
      err,
    );
  }
  if (!res.ok) {
    throw new PrNewswireFetchError(`PR Newswire HTTP ${res.status}: ${url}`);
  }
  const html = await res.text();
  if (html.length < 2000) {
    throw new PrNewswireFetchError(
      `PR Newswire 返回过短 HTML (${html.length} bytes)，可能是跳转/拦截页：${url}`,
    );
  }
  cache.set(url, { html, at: now });
  return html;
}

export async function loadPrNewswireHtml(options: {
  url: string;
  fixturePath?: string;
}): Promise<string> {
  const fixture = options.fixturePath?.trim();
  if (fixture && fs.existsSync(fixture)) {
    return fs.readFileSync(fixture, "utf8");
  }
  return fetchPrNewswireHtml(options.url);
}

export function clearPrNewswireHtmlCache(): void {
  cache.clear();
}

/** 列表页第 page 页 URL（第 1 页即列表基础 URL，不带 query） */
export function prNewswireListPageUrl(page: number): string {
  return page <= 1 ? PR_NEWSWIRE_ISM_LIST_URL : `${PR_NEWSWIRE_ISM_LIST_URL}?page=${page}`;
}

export async function loadPrNewswireListPageHtml(
  page: number,
  options?: { fixturePath?: string },
): Promise<string> {
  return loadPrNewswireHtml({ url: prNewswireListPageUrl(page), fixturePath: options?.fixturePath });
}
