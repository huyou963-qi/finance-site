import fs from "node:fs";

/**
 * Zillow 观测租金指数（Zillow Observed Rent Index，ZORI）—— 数据源。
 *
 * Zillow Research 以静态 CSV 公开分发（研究数据页 https://www.zillow.com/research/data/
 * 「Rentals」一节的下载链接），免费公开使用、须署名 Zillow。文件托管在
 * files.zillowstatic.com（CDN 静态文件），不是抓取 zillow.com 网页——zillow.com 本身有
 * 人机验证（PerimeterX），不访问、不绕过。
 *
 * 选用「Metro & U.S. · All Homes Plus Multifamily · Smoothed, Seasonally Adjusted」：
 * 行 = 地区（首行 United States，RegionType=country），列 = 月末日期，值 = 美元/月。
 * 每月中旬整表重发，平滑与季调会修订全部历史，因此每次全量回读。
 * 2026-09-24 实测香港机房直连 200（约 1MB）。
 */
export const ZILLOW_ZORI_CSV_URL =
  "https://files.zillowstatic.com/research/public_csvs/zori/Metro_zori_uc_sfrcondomfr_sm_sa_month.csv";
export const ZILLOW_RESEARCH_DATA_URL = "https://www.zillow.com/research/data/";

let cache: { at: number; url: string; text: string } | null = null;
const CACHE_TTL_MS = 60_000;

/** 抓取（或读 fixture）ZORI CSV；同轮 worker 60s 内复用 */
export async function fetchZillowZoriCsv(opts?: { fixturePath?: string; url?: string }): Promise<string> {
  if (opts?.fixturePath) return fs.readFileSync(opts.fixturePath, "utf8");
  const url = opts?.url ?? ZILLOW_ZORI_CSV_URL;
  if (cache && cache.url === url && Date.now() - cache.at < CACHE_TTL_MS) return cache.text;

  const res = await fetch(url, {
    headers: {
      "User-Agent": process.env.ZILLOW_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0",
      Accept: "text/csv,*/*",
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`Zillow ZORI 抓取 HTTP ${res.status}: ${url}`);
  }
  const text = await res.text();
  cache = { at: Date.now(), url, text };
  return text;
}

export function clearZillowZoriCache(): void {
  cache = null;
}
