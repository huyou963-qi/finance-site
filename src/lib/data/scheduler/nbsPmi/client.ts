import fs from "node:fs";
import * as XLSX from "xlsx";
import { NBS_PMI_INDEX_URL } from "./catalog";
import { fetchChinaOfficial } from "../chinaOfficialProxy";

/**
 * 国家统计局 PMI 官方发布结构（2026-08 核实）：
 * 1. /sj/zxfb/ 最新发布目录中，标题锚点为「YYYY年M月中国采购经理指数运行情况」；
 * 2. 发布正文含「相关数据表」锚点，指向 P*.xls；
 * 3. Excel 含「制造业」「非制造业」两张表及连续 13 个月历史。
 *
 * data.stats.gov.cn/easyquery 在当前环境返回 403，因此不作为生产依赖。
 * www.stats.gov.cn 无 robots.txt（404）；服务条款允许下载和使用统计数据并要求注明来源。
 */

const CACHE_TTL_MS = 60_000;
const DEFAULT_USER_AGENT = "finance-site-data-scheduler/1.0";

export type NbsPmiWorkbookResult = {
  workbook: XLSX.WorkBook;
  articleUrl: string;
  workbookUrl: string;
};

let cache: { at: number; result: NbsPmiWorkbookResult } | null = null;

function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/gi, " ").trim();
}

function anchors(html: string): Array<{ href: string; text: string }> {
  const out: Array<{ href: string; text: string }> = [];
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(re)) {
    out.push({ href: match[1]!, text: stripTags(match[2]!) });
  }
  return out;
}

export function parseLatestPmiArticleUrl(
  html: string,
  indexUrl = NBS_PMI_INDEX_URL,
): string {
  const hit = anchors(html).find((a) => /中国采购经理指数运行情况/.test(a.text));
  if (!hit) {
    throw new Error("国家统计局 PMI：最新发布目录未找到 PMI 标题锚点（页面结构可能已变）");
  }
  return new URL(hit.href, indexUrl).toString();
}

export function parsePmiWorkbookUrl(html: string, articleUrl: string): string {
  const hit = anchors(html).find(
    (a) => /相关数据表/.test(a.text) && /\.xlsx?(?:$|[?#])/i.test(a.href),
  );
  if (!hit) {
    throw new Error("国家统计局 PMI：发布页未找到「相关数据表」Excel 锚点（页面结构可能已变）");
  }
  return new URL(hit.href, articleUrl).toString();
}

async function fetchOfficial(url: string, accept: string): Promise<Response> {
  const response = await fetchChinaOfficial(url, {
    headers: {
      "User-Agent": process.env.NBS_USER_AGENT?.trim() || DEFAULT_USER_AGENT,
      Accept: accept,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`国家统计局 PMI 抓取 HTTP ${response.status}: ${url}`);
  }
  return response;
}

export async function fetchNbsPmiWorkbook(opts?: {
  fixturePath?: string;
  indexUrl?: string;
  articleUrl?: string;
  workbookUrl?: string;
}): Promise<NbsPmiWorkbookResult> {
  if (opts?.fixturePath) {
    return {
      workbook: XLSX.read(fs.readFileSync(opts.fixturePath), { type: "buffer" }),
      articleUrl: "fixture",
      workbookUrl: opts.fixturePath,
    };
  }
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.result;

  const indexUrl = opts?.indexUrl ?? NBS_PMI_INDEX_URL;
  const articleUrl =
    opts?.articleUrl ??
    parseLatestPmiArticleUrl(
      await (await fetchOfficial(indexUrl, "text/html,*/*")).text(),
      indexUrl,
    );
  const workbookUrl =
    opts?.workbookUrl ??
    parsePmiWorkbookUrl(
      await (await fetchOfficial(articleUrl, "text/html,*/*")).text(),
      articleUrl,
    );
  const buffer = Buffer.from(
    await (
      await fetchOfficial(
        workbookUrl,
        "application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
      )
    ).arrayBuffer(),
  );
  const result = {
    workbook: XLSX.read(buffer, { type: "buffer" }),
    articleUrl,
    workbookUrl,
  };
  cache = { at: Date.now(), result };
  return result;
}

export function clearNbsPmiCache(): void {
  cache = null;
}
