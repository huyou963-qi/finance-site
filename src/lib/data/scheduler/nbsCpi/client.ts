import fs from "node:fs";
import * as XLSX from "xlsx";
import { NBS_CPI_INDEX_URL } from "./catalog";

const DEFAULT_USER_AGENT = "finance-site-data-scheduler/1.0";
const CACHE_TTL_MS = 60_000;
let cache: { at: number; result: NbsCpiWorkbookResult } | null = null;

export type NbsCpiWorkbookResult = { workbook: XLSX.WorkBook; articleUrl: string; workbookUrl: string };

function text(value: string) { return value.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/gi, " ").trim(); }
function links(html: string) {
  return [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ href: match[1]!, text: text(match[2]!) }));
}
async function get(url: string, accept: string) {
  const response = await fetch(url, { headers: { "User-Agent": process.env.NBS_USER_AGENT?.trim() || DEFAULT_USER_AGENT, Accept: accept }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`国家统计局 CPI 抓取 HTTP ${response.status}: ${url}`);
  return response;
}
export function parseLatestCpiArticleUrl(html: string, indexUrl = NBS_CPI_INDEX_URL) {
  const hit = links(html).find((link) => /居民消费价格同比/.test(link.text));
  if (!hit) throw new Error("国家统计局 CPI：发布目录未找到最新 CPI 标题锚点（页面结构可能已变）");
  return new URL(hit.href, indexUrl).toString();
}
export function parseCpiWorkbookUrl(html: string, articleUrl: string) {
  const hit = links(html).find((link) => /相关数据表/.test(link.text) && /\.xlsx?(?:$|[?#])/i.test(link.href));
  if (!hit) throw new Error("国家统计局 CPI：发布页未找到「相关数据表」Excel 锚点（页面结构可能已变）");
  return new URL(hit.href, articleUrl).toString();
}
export async function fetchNbsCpiWorkbook(opts?: { fixturePath?: string; indexUrl?: string; articleUrl?: string; workbookUrl?: string }): Promise<NbsCpiWorkbookResult> {
  if (opts?.fixturePath) return { workbook: XLSX.read(fs.readFileSync(opts.fixturePath), { type: "buffer" }), articleUrl: "fixture", workbookUrl: opts.fixturePath };
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.result;
  const indexUrl = opts?.indexUrl ?? NBS_CPI_INDEX_URL;
  const articleUrl = opts?.articleUrl ?? (opts?.workbookUrl ? "direct-workbook-url" : parseLatestCpiArticleUrl(await (await get(indexUrl, "text/html,*/*")).text(), indexUrl));
  const workbookUrl = opts?.workbookUrl ?? parseCpiWorkbookUrl(await (await get(articleUrl, "text/html,*/*")).text(), articleUrl);
  const workbook = XLSX.read(Buffer.from(await (await get(workbookUrl, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*")).arrayBuffer()), { type: "buffer" });
  return (cache = { at: Date.now(), result: { workbook, articleUrl, workbookUrl } }).result;
}
export function clearNbsCpiCache() { cache = null; }
