import fs from "node:fs";

/**
 * Shiller CAPE（周期调整市盈率，P/E10）—— 数据源。
 *
 * 源选择记录（2026-09 核实，详见模块注释与 Spec §3.1）：
 * - Yale 官方 `ie_data.xls`（http://www.econ.yale.edu/~shiller/data/ie_data.xls）结构清晰
 *   （sheet "Data"，列 M = "P/E10 or CAPE"），但**已停更**：抓取时 Last-Modified 为
 *   2023-10-17，最后一行有效 CAPE 为 2023.09（2023 年 9 月），落后当前近 3 年；
 *   `data.htm` 页面本身也已不再链接 ie_data.xls（页面已改版为 homepricefutures.com 广告页）。
 *   Yale 源不可用于持续更新，弃用。
 * - multpl.com/shiller-pe/table/by-month：干净的 Date/Value HTML 表，一次性含 1871-02 至今
 *   全部月度历史（2026-09 抓取时 1867 行，最新 2026-09-03）；robots.txt 无 Disallow（全站开放）。
 *   采用此源。
 */
export const SHILLER_CAPE_PAGE_URL =
  "https://www.multpl.com/shiller-pe/table/by-month";

let cache: { at: number; html: string } | null = null;
const CACHE_TTL_MS = 60_000;

/** 抓取（或读 fixture）multpl.com Shiller CAPE 月度历史表；同轮 worker 60s 内复用 */
export async function fetchShillerCapePage(opts?: {
  fixturePath?: string;
  url?: string;
}): Promise<string> {
  if (opts?.fixturePath) {
    return fs.readFileSync(opts.fixturePath, "utf8");
  }
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.html;

  const url = opts?.url ?? SHILLER_CAPE_PAGE_URL;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        process.env.SHILLER_CAPE_USER_AGENT?.trim() ||
        "finance-site-data-scheduler/1.0",
      Accept: "text/html,*/*",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Shiller CAPE 抓取 HTTP ${res.status}: ${url}`);
  }
  const html = await res.text();
  cache = { at: Date.now(), html };
  return html;
}

export function clearShillerCapeCache(): void {
  cache = null;
}
