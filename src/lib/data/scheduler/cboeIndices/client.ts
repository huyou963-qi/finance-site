import fs from "node:fs";

/**
 * CBOE VIX9D / VVIX —— 数据源。
 * 官方以结构化 CSV 全量历史分发（无需登录/付费）：
 *   VIX9D: https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX9D_History.csv
 *          列 DATE,OPEN,HIGH,LOW,CLOSE（MM/DD/YYYY），历史起 2011-01-04，取 CLOSE。
 *   VVIX:  https://cdn.cboe.com/api/global/us_indices/daily_prices/VVIX_History.csv
 *          列 DATE,VVIX（MM/DD/YYYY），历史起 2006-03-06。
 * 均非 FRED 序列（已核实 FRED "CBOE Market Statistics" release rid=200 / tag=cboe
 * 全部 21/25 条序列不含 VIX9D、VVIX；直接猜测 series id VIX9D/VVIXCLS 均 404）。
 * 合规：`cdn.cboe.com/robots.txt` 返回 S3 AccessDenied XML（非真实 robots.txt），
 * 无可读的爬取限制条目；页面公开、无登录/付费墙、无访问控制绕过（2026-09 核实）。
 */

let cache: Map<string, { at: number; text: string }> = new Map();
const CACHE_TTL_MS = 60_000;

/** 抓取（或读 fixture）CBOE 指数 CSV 原始文本；同一 series 60s 内复用，避免重复请求源站 */
export async function fetchCboeIndexCsv(
  seriesKey: string,
  opts?: { fixturePath?: string; url?: string },
): Promise<string> {
  if (opts?.fixturePath) {
    return fs.readFileSync(opts.fixturePath, "utf-8");
  }
  const cached = cache.get(seriesKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.text;

  const url = opts?.url;
  if (!url) throw new Error(`CBOE ${seriesKey}：缺 url`);
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        process.env.CBOE_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0",
      Accept: "text/csv,*/*",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`CBOE ${seriesKey} 抓取 HTTP ${res.status}: ${url}`);
  }
  const text = await res.text();
  cache.set(seriesKey, { at: Date.now(), text });
  return text;
}

export function clearCboeIndexCache(): void {
  cache = new Map();
}
