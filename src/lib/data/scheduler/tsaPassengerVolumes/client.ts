import fs from "node:fs";
import { tsaPassengerVolumesUrlForYear } from "./catalog";

/**
 * TSA 安检口旅客通过人数 —— 数据源。
 * 官方 https://www.tsa.gov/travel/passenger-volumes 为标准 Drupal 站点服务端渲染的
 * HTML 表格（Date / Numbers 两列，日频，M-F 上午 9 点前更新），无隐藏 JSON/CSV 接口
 * （已核实页面 Network 请求与源码，仅静态资源）。
 * 当年页面为滚动窗口（只含当年 1 月 1 日至今），往年数据在
 * /travel/passenger-volumes/{year} 归档页（已核实 2019-2025 均存在，2018 及更早无归档，
 * 回填深度上限为 2019-01-01——页面本身的限制，如实记录）。
 * robots.txt 核实（2026-09）：Disallow 仅覆盖 /data/ /node/ /file/ /taxonomy/ 等路径，
 * /travel/passenger-volumes 及其年度归档不在禁止范围；页面公开、无需登录。
 */

let cache: Map<string, { at: number; html: string }> = new Map();
const CACHE_TTL_MS = 60_000;

export async function fetchTsaPassengerVolumesPage(
  year: number,
  currentYear: number,
  opts?: { fixturePath?: string; url?: string },
): Promise<string> {
  if (opts?.fixturePath) {
    return fs.readFileSync(opts.fixturePath, "utf-8");
  }
  const url = opts?.url ?? tsaPassengerVolumesUrlForYear(year, currentYear);
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.html;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        process.env.TSA_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0",
      Accept: "text/html,*/*",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`TSA 抓取 HTTP ${res.status}: ${url}`);
  }
  const html = await res.text();
  cache.set(url, { at: Date.now(), html });
  return html;
}

export function clearTsaPassengerVolumesCache(): void {
  cache = new Map();
}
