import fs from "node:fs";
import { AAR_NEWS_ARCHIVE_URL } from "./catalog";

/**
 * AAR 美国铁路周度装车量/多式联运量 —— 数据源。
 * 官方 aar.org 每周三中午发布 Weekly Railroad Traffic 新闻稿（HTML 正文，非 PDF-only；
 * 另附 PDF 下载但正文已含所需数字，无需解析 PDF）。
 * 历史新闻稿列表：/aar_news/weekly-rail-traffic-data/（分页 /page/{n}/，
 * 2026-09 核实共 51 页，最早至 2017-01），每条链接到独立正文页
 * /news/aar-reports-weekly-rail-traffic-for-the-week-ending-{month}-{day}-{year}/。
 * robots.txt 核实（2026-09）：仅 Disallow /wp-admin/，/news/ /aar_news/ 均不受限；
 * 页面公开、无需登录/付费墙。
 * 正文句式（"total U.S. weekly rail traffic was...", "Total carloads for the week
 * ending... were...", "U.S. weekly intermodal volume was..."）自 2019-01 起稳定
 * （已用 2019-03-23 与 2026-08-22 两个 fixture 交叉核实）。
 */

let pageCache: Map<string, { at: number; html: string }> = new Map();
const CACHE_TTL_MS = 60_000;

function archiveListUrl(pageNum: number): string {
  return pageNum <= 1 ? AAR_NEWS_ARCHIVE_URL : `${AAR_NEWS_ARCHIVE_URL}page/${pageNum}/`;
}

async function fetchHtml(url: string, fixturePath?: string): Promise<string> {
  if (fixturePath) {
    return fs.readFileSync(fixturePath, "utf-8");
  }
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.html;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        process.env.AAR_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0",
      Accept: "text/html,*/*",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`AAR 抓取 HTTP ${res.status}: ${url}`);
  }
  const html = await res.text();
  pageCache.set(url, { at: Date.now(), html });
  return html;
}

/** 抓取新闻稿归档列表第 pageNum 页（1-based） */
export async function fetchAarArchiveListPage(
  pageNum: number,
  opts?: { fixturePath?: string },
): Promise<string> {
  return fetchHtml(archiveListUrl(pageNum), opts?.fixturePath);
}

/** 抓取单篇周度新闻稿正文 */
export async function fetchAarWeeklyReleasePage(
  url: string,
  opts?: { fixturePath?: string },
): Promise<string> {
  return fetchHtml(url, opts?.fixturePath);
}

export function clearAarRailTrafficCache(): void {
  pageCache = new Map();
}
