import type { ObservationPoint } from "../types";
import { fetchChinaOfficial } from "../chinaOfficialProxy";
import {
  NBS_FAI_ANNUAL_ROOT_ID,
  NBS_FAI_API_BASE,
  NBS_FAI_CATALOGS,
  NBS_FAI_MONTHLY_ROOT_ID,
  NBS_FAI_RELEASE_INDEX_URL,
  type FaiCatalog,
  type FaiFrequency,
} from "./catalog";
import { parseNbsFaiResponse } from "./parseResponse";
import { parseFaiInfrastructureRelease, type FaiInfrastructureDefinition } from "./parseRelease";

export type FaiIndicator = { cid: string; indicatorId: string; label: string; frequency: FaiFrequency; group: string; unit: "%" | "亿元" };
const headers = { Referer: "https://data.stats.gov.cn/dg/website/page.html", "User-Agent": process.env.NBS_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0" };
const years = (frequency: FaiFrequency, start: number) => frequency === "monthly" ? [`${start}01MM-${new Date().getUTCFullYear() + 1}12MM`] : [`${start}YY-${new Date().getUTCFullYear() + 1}YY`];
let wafCookie = "";

async function nbsFetch(url: string, init: RequestInit) {
  const first = await fetchChinaOfficial(url, { ...init, redirect: "manual" });
  if (first.status < 300 || first.status >= 400) return first;
  const cookie = first.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) return first;
  wafCookie = cookie;
  return fetchChinaOfficial(url, { ...init, headers: { ...(init.headers as Record<string, string>), Cookie: wafCookie }, redirect: "manual" });
}

async function getIndicators(catalog: FaiCatalog) {
  const response = await nbsFetch(`${NBS_FAI_API_BASE}/new/queryIndicatorsByCid?cid=${catalog.cid}`, { headers: wafCookie ? { ...headers, Cookie: wafCookie } : headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`国家数据固定资产投资目录 HTTP ${response.status}: ${catalog.cid}`);
  const json = await response.json() as { data?: { list?: Array<{ _id?: string; i_showname?: string }> } };
  if (!Array.isArray(json.data?.list)) throw new Error(`国家数据固定资产投资目录缺失：${catalog.cid}`);
  return json.data.list.flatMap((item) => item._id && item.i_showname ? [{ cid: catalog.cid, indicatorId: item._id, label: item.i_showname.replace(/\s+/g, " ").trim(), frequency: catalog.frequency, group: catalog.group, unit: /\(%\)|增长/.test(item.i_showname) ? "%" as const : "亿元" as const }] : []);
}

export async function fetchNbsFaiCatalog(): Promise<FaiIndicator[]> {
  const output: FaiIndicator[] = [];
  for (const catalog of NBS_FAI_CATALOGS) {
    output.push(...await getIndicators(catalog));
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return output;
}

async function request(cid: string, ids: string[], frequency: FaiFrequency, startYear: number) {
  const response = await nbsFetch(`${NBS_FAI_API_BASE}/stream/esData`, {
    method: "POST",
    headers: { ...headers, ...(wafCookie ? { Cookie: wafCookie } : {}), "Content-Type": "application/json" },
    body: JSON.stringify({ cid, indicatorIds: ids, das: [{ text: "全国", value: "000000000000" }], dts: years(frequency, startYear), showType: "1", rootId: frequency === "monthly" ? NBS_FAI_MONTHLY_ROOT_ID : NBS_FAI_ANNUAL_ROOT_ID }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`国家数据固定资产投资历史 HTTP ${response.status}: ${cid}`);
  return response.json();
}

export async function fetchNbsFaiGroup(items: readonly FaiIndicator[], startYear: number): Promise<Map<string, ObservationPoint[]>> {
  if (!items.length) return new Map();
  const first = items[0]!;
  if (items.some((item) => item.cid !== first.cid || item.frequency !== first.frequency)) throw new Error("固定资产投资请求分组错误");
  const result = parseNbsFaiResponse(await request(first.cid, items.map((item) => item.indicatorId), first.frequency, startYear), items.map((item) => item.indicatorId), first.frequency);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return result;
}

export async function fetchNbsFaiSeries(item: FaiIndicator, startYear: number) { return (await fetchNbsFaiGroup([item], startYear)).get(item.indicatorId) ?? []; }

function strip(text: string) { return text.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " "); }

type FaiReleaseArticle = { url: string; label: string };

function releaseLinks(html: string, pageUrl: string): FaiReleaseArticle[] {
  return [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ url: new URL(match[1]!, pageUrl).toString(), label: strip(match[2]!) }))
    .filter((item) => /全国固定资产投资/.test(item.label));
}

async function faiReleaseArticles(historical: boolean): Promise<FaiReleaseArticle[]> {
  const first = await fetchChinaOfficial(NBS_FAI_RELEASE_INDEX_URL, { headers, signal: AbortSignal.timeout(30_000) });
  if (!first.ok) throw new Error(`国家统计局发布目录 HTTP ${first.status}`);
  const firstHtml = await first.text();
  const total = Math.min(Number(/createPageHTML\((\d+)/.exec(firstHtml)?.[1] ?? 1), 80);
  const pages = historical ? total : Math.min(total, 3);
  const output = new Map<string, FaiReleaseArticle>();
  for (let page = 0; page < pages; page++) {
    const pageUrl = page === 0 ? NBS_FAI_RELEASE_INDEX_URL : new URL(`index_${page}.html`, NBS_FAI_RELEASE_INDEX_URL).toString();
    const html = page === 0 ? firstHtml : await (await fetchChinaOfficial(pageUrl, { headers, signal: AbortSignal.timeout(30_000) })).text();
    for (const item of releaseLinks(html, pageUrl)) output.set(item.url, item);
    if (page > 0) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return [...output.values()];
}

export async function fetchFaiInfrastructureHistory(options: { historical?: boolean } = {}): Promise<{
  points: ObservationPoint[];
  articleUrl: string;
  definitions: Array<{ obsDate: string; definition: FaiInfrastructureDefinition; articleUrl: string }>;
}> {
  const articles = await faiReleaseArticles(Boolean(options.historical));
  const points = new Map<number, ObservationPoint>();
  const definitions = new Map<number, { obsDate: string; definition: FaiInfrastructureDefinition; articleUrl: string }>();
  let articleUrl = NBS_FAI_RELEASE_INDEX_URL;
  for (const article of articles) {
    const response = await fetchChinaOfficial(article.url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) continue;
    try {
      const parsed = parseFaiInfrastructureRelease(await response.text());
      const key = parsed.point.obsDate.getTime();
      points.set(key, parsed.point);
      definitions.set(key, { obsDate: parsed.point.obsDate.toISOString().slice(0, 10), definition: parsed.definition, articleUrl: article.url });
      if (key >= Math.max(...points.keys())) articleUrl = article.url;
    } catch {
      // Some archive links are interpretation pages rather than the data release.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!points.size) throw new Error("国家统计局发布目录未找到基础设施投资累计同比锚点");
  return {
    points: [...points.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime()),
    articleUrl,
    definitions: [...definitions.values()].sort((a, b) => a.obsDate.localeCompare(b.obsDate)),
  };
}

export async function fetchLatestFaiInfrastructure() {
  const history = await fetchFaiInfrastructureHistory();
  return { point: history.points.at(-1)!, articleUrl: history.articleUrl, definitions: history.definitions };
}

/** 国家统计局月报是总项环比的官方来源。 */
export async function fetchFaiMomHistory(): Promise<{ points: ObservationPoint[]; articleUrl: string }> {
  const index = await fetchChinaOfficial(NBS_FAI_RELEASE_INDEX_URL, { headers, signal: AbortSignal.timeout(30_000) });
  if (!index.ok) throw new Error(`国家统计局发布目录 HTTP ${index.status}`);
  const links = [...(await index.text()).matchAll(/href="([^"]*\/\d{6}\/t\d+_\d+\.html)"/g)].map((item) => new URL(item[1]!, NBS_FAI_RELEASE_INDEX_URL).toString());
  for (const url of [...new Set(links)].slice(0, 80)) {
    const response = await fetchChinaOfficial(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) continue;
    const text = strip(await response.text());
    const match = /从环比看.{0,100}?(\d{1,2})月份固定资产投资.{0,30}?(增长|下降)([\d.]+)\s*%/.exec(text);
    const yearMonth = /(\d{4})年[^年]{0,16}?(\d{1,2})月份全国固定资产投资/.exec(text);
    if (!match || !yearMonth) continue;
    const latest = { obsDate: new Date(Date.UTC(Number(yearMonth[1]), Number(yearMonth[2]) - 1, 1)), value: (match[2] === "下降" ? -1 : 1) * Number(match[3]) };
    const revision = text.slice(text.indexOf("环比数据修订"), text.indexOf("同比增速说明"));
    let year: number | null = null;
    const points: ObservationPoint[] = [];
    for (const row of revision.matchAll(/(?:(\d{4})年)?\s*(\d{1,2})月\s*(-?\d+(?:\.\d+)?)/g)) {
      if (row[1]) year = Number(row[1]);
      if (year) points.push({ obsDate: new Date(Date.UTC(year, Number(row[2]) - 1, 1)), value: Number(row[3]) });
    }
    points.push(latest);
    const unique = new Map(points.map((point) => [point.obsDate.getTime(), point]));
    return { points: [...unique.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime()), articleUrl: url };
  }
  throw new Error("国家统计局发布目录未找到固定资产投资总项环比锚点");
}

export async function fetchLatestFaiMom(): Promise<{ point: ObservationPoint; articleUrl: string }> {
  const history = await fetchFaiMomHistory();
  const point = history.points.at(-1);
  if (!point) throw new Error("国家统计局固定资产投资环比修订表为空");
  return { point, articleUrl: history.articleUrl };
}
