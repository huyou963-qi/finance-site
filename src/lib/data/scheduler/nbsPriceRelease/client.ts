import fs from "node:fs";
import * as XLSX from "xlsx";
import { fetchChinaOfficial } from "../chinaOfficialProxy";
// Shared NBS release/attachment transport; all domains use fetchChinaOfficial.
export type PriceReportKind = "CPI" | "PPI" | "INDUSTRIAL" | "RETAIL" | "GDP";
export type PriceWorkbookOptions = { fixturePath?: string; indexUrl?: string; articleUrl?: string; workbookUrl?: string };
export type PriceWorkbookResult = { workbook: XLSX.WorkBook; articleUrl: string; workbookUrl: string };
const indexDefault = "https://www.stats.gov.cn/sj/zxfbhjd/";
const cache = new Map<string, { at: number; promise: Promise<PriceWorkbookResult> }>();
function links(html: string) {
  return [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(m => ({ href: m[1]!, text: m[2]!.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/gi, " ").trim() }));
}
export function parsePriceArticleUrl(html: string, kind: PriceReportKind, indexUrl = indexDefault) {
  const title = {
    CPI: /居民消费价格同比/,
    PPI: /^20\d{2}年\d{1,2}月份工业生产者出厂价格同比/,
    INDUSTRIAL: /^20\d{2}年\d{1,2}月份规模以上工业增加值/,
    RETAIL: /^20\d{2}年(?:1[—－-])?\d{1,2}月份社会消费品零售/,
    GDP: /^(?:(?:20\d{2}年)?(?:一季度|上半年|前三季度).*经济|20\d{2}年(?:国民)?经济)/,
  }[kind];
  const hit = links(html).find(link => title.test(link.text));
  if (!hit) throw new Error(`国家统计局 ${kind}：发布目录未找到最新月报标题锚点`);
  return new URL(hit.href, indexUrl).toString();
}
export function parsePriceWorkbookUrl(html: string, articleUrl: string, kind: PriceReportKind) {
  const hit = links(html).find(link => /相关数据表/.test(link.text) && /\.xlsx?(?:$|[?#])/i.test(link.href));
  if (!hit) throw new Error(`国家统计局 ${kind}：发布页未找到「相关数据表」Excel 锚点`);
  return new URL(hit.href, articleUrl).toString();
}
async function get(url: string, kind: PriceReportKind, accept = "text/html,*/*") {
  const response = await fetchChinaOfficial(url, { headers: { "User-Agent": process.env.NBS_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0", Accept: accept }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`国家统计局 ${kind} 抓取 HTTP ${response.status}: ${url}`);
  return response;
}
async function load(kind: PriceReportKind, opts: PriceWorkbookOptions): Promise<PriceWorkbookResult> {
  const indexUrl = opts.indexUrl ?? indexDefault;
  let articleUrl = opts.articleUrl;
  if (!articleUrl && !opts.workbookUrl) {
    for (let page = 0; page < 6; page++) {
      const url = page === 0 ? indexUrl : new URL(`index_${page}.html`, indexUrl).toString();
      const html = await (await get(url, kind)).text();
      try { articleUrl = parsePriceArticleUrl(html, kind, url); break; }
      catch { /* Only a missing anchor permits trying the bounded next page. */ }
    }
    if (!articleUrl) throw new Error(`国家统计局 ${kind}：发布归档前6页未找到月报，停止更新而非报告无变化`);
  }
  articleUrl ??= "direct-workbook-url";
  const workbookUrl = opts.workbookUrl ?? parsePriceWorkbookUrl(await (await get(articleUrl, kind)).text(), articleUrl, kind);
  const bytes = Buffer.from(await (await get(workbookUrl, kind, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*")).arrayBuffer());
  return { workbook: XLSX.read(bytes, { type: "buffer" }), articleUrl, workbookUrl };
}
const articleCache = new Map<string, { at: number; promise: Promise<{ html: string; articleUrl: string }> }>();
/** Reuse the same bounded NBS discovery and transport for non-Excel releases. */
export async function fetchNbsReleaseArticle(kind: PriceReportKind, indexUrl = indexDefault) {
  const key = `${kind}:${indexUrl}`, old = articleCache.get(key);
  if (old && Date.now() - old.at < 60_000) return old.promise;
  const promise = (async () => {
    for (let page = 0; page < 6; page++) {
      const url = page === 0 ? indexUrl : new URL(`index_${page}.html`, indexUrl).toString();
      const html = await (await get(url, kind)).text();
      let articleUrl: string;
      try { articleUrl = parsePriceArticleUrl(html, kind, url); } catch { continue; }
      return { html: await (await get(articleUrl, kind)).text(), articleUrl };
    }
    throw new Error(`NBS ${kind}: latest release absent from bounded archive`);
  })();
  articleCache.set(key, { at: Date.now(), promise });
  try { return await promise; } catch (error) { articleCache.delete(key); throw error; }
}
export async function fetchNbsPriceWorkbook(kind: PriceReportKind, opts: PriceWorkbookOptions = {}): Promise<PriceWorkbookResult> {
  if (opts.fixturePath) return { workbook: XLSX.read(fs.readFileSync(opts.fixturePath), { type: "buffer" }), articleUrl: "fixture", workbookUrl: opts.fixturePath };
  const key = JSON.stringify([kind, opts.indexUrl, opts.articleUrl, opts.workbookUrl]), old = cache.get(key);
  if (old && Date.now() - old.at < 60_000) return old.promise;
  const promise = load(kind, opts);
  cache.set(key, { at: Date.now(), promise });
  try { return await promise; } catch (error) { cache.delete(key); throw error; }
}
export function clearPriceWorkbookCache(kind?: PriceReportKind) {
  for (const key of cache.keys()) if (!kind || JSON.parse(key)[0] === kind) cache.delete(key);
  for (const key of articleCache.keys()) if (!kind || key.startsWith(`${kind}:`)) articleCache.delete(key);
}
