import fs from "node:fs";
import { gaccMonthlyIndexUrl } from "./catalog";

/**
 * 海关总署主要商品量值表 —— 数据源。
 *
 * english.customs.gov.cn 为服务端渲染的静态 HTML（无隐藏 JSON/CSV 接口，已核实页面
 * 网络请求与源码），索引页按年归档：当年 monthly.html，往年 monthly<YYYY>.html（2018 起）。
 *
 * 合规（2026-09 实测）：
 *   - GET http://english.customs.gov.cn/robots.txt → 404，站点无 robots.txt，即无 Disallow；
 *   - 页面公开、无需登录、无使用条款禁止自动获取；
 *   - 月频数据，worker 按发布日历触发；历史回填串行 + 1.5s 间隔限速，不并发轰炸。
 *
 * 注意：该站**只有 HTTP**，https 侧握手不通（实测 504）。因此这里显式使用 http://，
 * 不要"顺手"改成 https，否则全量抓取会静默失败。
 */

const CACHE_TTL_MS = 60_000;
let cache = new Map<string, { at: number; html: string }>();

async function get(url: string): Promise<string> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.html;
  const res = await fetch(url, {
    headers: {
      "User-Agent": process.env.GACC_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0",
      Accept: "text/html,*/*",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`海关英文站抓取 HTTP ${res.status}: ${url}`);
  const html = await res.text();
  if (html.length < 2_000) {
    throw new Error(`海关英文站抓取内容异常短（${html.length} 字节）: ${url}`);
  }
  cache.set(url, { at: Date.now(), html });
  return html;
}

/** 月报索引页（当年或某个归档年份） */
export async function fetchGaccMonthlyIndex(
  year: number,
  currentYear: number,
  opts?: { fixturePath?: string; url?: string },
): Promise<string> {
  if (opts?.fixturePath) return fs.readFileSync(opts.fixturePath, "utf-8");
  return get(opts?.url ?? gaccMonthlyIndexUrl(year, currentYear));
}

/** 某一期表(13)/(14) 详情页 */
export async function fetchGaccCommodityTable(
  url: string,
  opts?: { fixturePath?: string },
): Promise<string> {
  if (opts?.fixturePath) return fs.readFileSync(opts.fixturePath, "utf-8");
  return get(url);
}

export function clearGaccCommodityCache(): void {
  cache = new Map();
}
