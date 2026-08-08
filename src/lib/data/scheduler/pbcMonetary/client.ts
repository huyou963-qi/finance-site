import type { ObservationPoint } from "../types";
import { fetchChinaOfficial } from "../chinaOfficialProxy";
import { PBC_LPR_INDEX_URL, PBC_MONETARY_INDEX_URL } from "./catalog";
import { parsePbcMonetaryPage } from "./parsePbcMonetaryPage";

type Article = { url: string; title: string };
type History = Map<string, ObservationPoint[]>;
let cache: { at: number; values: History } | null = null;
const HEADERS = { "User-Agent": process.env.PBC_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0" };
const HISTORY_MIN_INTERVAL_MS = 300;

function sleep(ms: number) { return new Promise<void>((resolve) => setTimeout(resolve, ms)); }
async function html(url: string): Promise<string> {
  const response = await fetchChinaOfficial(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`人民银行公告 HTTP ${response.status}: ${url}`);
  // PBC omits the HTTP charset header. Current archive pages declare UTF-8 in HTML;
  // fall back to GB18030 only for legacy pages that do not expose Chinese text.
  const bytes = await response.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return /[\u4e00-\u9fff]/.test(utf8) ? utf8 : new TextDecoder("gb18030").decode(bytes);
}
function strip(value: string) { return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function links(page: string, url: string, allowed: (title: string) => boolean): Article[] {
  const found: Article[] = [];
  for (const match of page.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = strip(match[2]!);
    if (allowed(title)) found.push({ url: new URL(match[1]!, url).toString(), title });
  }
  return found;
}
async function archive(indexUrl: string, allowed: (title: string) => boolean): Promise<Article[]> {
  const first = await html(indexUrl); const all = links(first, indexUrl, allowed);
  const template = /queryArticleByCondition\(this,'([^']+-2\.html)'\)/.exec(first)?.[1];
  if (!template) return [...new Map(all.map((item) => [item.url, item])).values()];
  for (let page = 2; page <= 45; page++) {
    const path = template.replace(/-2\.html$/, `-${page}.html`);
    const pageUrl = new URL(path, indexUrl).toString();
    let pageHtml: string;
    try { pageHtml = await html(pageUrl); }
    catch (error) {
      if (error instanceof Error && error.message.includes("HTTP 404")) break;
      throw error;
    }
    const found = links(pageHtml, pageUrl, allowed);
    if (!found.length) break;
    all.push(...found);
    await sleep(HISTORY_MIN_INTERVAL_MS);
  }
  return [...new Map(all.map((item) => [item.url, item])).values()];
}
function append(history: History, key: string, point: ObservationPoint) { const values = history.get(key) ?? []; values.push(point); history.set(key, values); }
function monthFromPage(htmlValue: string): Date | null {
  const match = /(?:<title[^>]*>|ArticleTitle[^>]*content=["'])(?:[\s\S]*?)(20\d{2})年\s*(\d{1,2})月/i.exec(htmlValue) ?? /PubDate[^>]*content=["'](20\d{2})-(\d{1,2})-\d{1,2}/i.exec(htmlValue);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)) : null;
}
function parseLpr(htmlValue: string): [string, ObservationPoint][] {
  const body = strip(htmlValue); const date = monthFromPage(htmlValue); if (!date) return [];
  const values: [string, ObservationPoint][] = [];
  const oneYear = /1年期LPR为([0-9.]+)%/.exec(body); const fiveYear = /5年(?:期)?以上LPR为([0-9.]+)%/.exec(body);
  if (oneYear) values.push(["lpr_1y", { obsDate: date, value: Number(oneYear[1]) }]);
  if (fiveYear) values.push(["lpr_5y", { obsDate: date, value: Number(fiveYear[1]) }]);
  return values;
}

/** Fetches the official PBC archive once and shares it across all 39 subscriptions. */
export async function fetchPbcMonetaryHistory(): Promise<History> {
  if (cache && Date.now() - cache.at < 24 * 60 * 60 * 1000) return cache.values;
  const financial = await archive(PBC_MONETARY_INDEX_URL, (title) => /金融统计数据报告|社会融资规模(?:增量|存量)统计数据报告/.test(title));
  const lpr = await archive(PBC_LPR_INDEX_URL, (title) => /贷款市场报价利率|LPR/i.test(title));
  const history: History = new Map(); let skipped = 0;
  for (const article of financial) {
    await sleep(HISTORY_MIN_INTERVAL_MS);
    try { for (const [key, point] of parsePbcMonetaryPage(await html(article.url))) append(history, key, point); }
    catch (error) { skipped++; console.warn(`[pbc-monetary] 跳过无法解析公告：${article.title} (${error instanceof Error ? error.message : String(error)})`); }
  }
  for (const article of lpr) {
    await sleep(HISTORY_MIN_INTERVAL_MS);
    try { for (const [key, point] of parseLpr(await html(article.url))) append(history, key, point); }
    catch (error) { skipped++; console.warn(`[pbc-monetary] 跳过无法解析 LPR 公告：${article.title} (${error instanceof Error ? error.message : String(error)})`); }
  }
  for (const [key, points] of history) {
    const unique = new Map(points.map((point) => [point.obsDate.getTime(), point]));
    history.set(key, [...unique.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime()));
  }
  if (!history.size) throw new Error("人民银行公告归档未解析出任何指标");
  if (skipped) console.warn(`[pbc-monetary] 历史归档跳过=${skipped} 篇，后续更新会重新尝试`);
  cache = { at: Date.now(), values: history }; return history;
}
export async function fetchPbcMonetarySeries(key: string, start: Date): Promise<ObservationPoint[]> {
  return (await fetchPbcMonetaryHistory()).get(key)?.filter((point) => point.obsDate >= start) ?? [];
}
