import { fetchChinaOfficial } from "../chinaOfficialProxy";

export const NBS_OFFICIAL_CALENDAR_URL =
  "https://www.stats.gov.cn/sj/fbrc/bnxxfb/";

let cache: { html: string; fetchedAt: number } | null = null;
const CACHE_MS = 60_000;

function fetchCause(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as Error & { cause?: unknown }).cause;
  return cause instanceof Error
    ? `${error.message}；cause=${cause.message}`
    : error.message;
}

/** 获取国家统计局“本年主要统计信息发布日程表”。 */
export async function loadNbsOfficialCalendarHtml(options?: {
  url?: string;
}): Promise<string> {
  const url = options?.url ?? NBS_OFFICIAL_CALENDAR_URL;
  const now = Date.now();
  if (!options?.url && cache && now - cache.fetchedAt < CACHE_MS) {
    return cache.html;
  }

  let response: Response;
  try {
    response = await fetchChinaOfficial(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    throw new Error(`国家统计局发布日程网络请求失败：${fetchCause(error)}`);
  }
  if (!response.ok) {
    throw new Error(`国家统计局发布日程 HTTP ${response.status}: ${url}`);
  }
  const html = await response.text();
  if (
    !/国家统计局主要统计信息发布日程表/.test(html) ||
    !/采购经理指数月度报告/.test(html)
  ) {
    throw new Error("国家统计局发布日程页面结构异常：未找到年度日程表");
  }
  if (!options?.url) cache = { html, fetchedAt: now };
  return html;
}

export function clearNbsOfficialCalendarCache(): void {
  cache = null;
}
