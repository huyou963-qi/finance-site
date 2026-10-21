import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { ObservationPoint } from "../types";
import { MOF_FISCAL_INDEX_URL, type FiscalMeasure } from "./catalog";
import { parseMofFiscalPage, type MofFiscalWrongComponent } from "./parsePage";
import { fetchChinaOfficial } from "../chinaOfficialProxy";

type Article = { url: string; title: string; year: number };
type History = Map<string, Map<FiscalMeasure, ObservationPoint[]>>;
export type MofFiscalMonthlyOnlyEvidence = { url: string; title: string; component: string; obsDate: Date; measures: Map<FiscalMeasure, ObservationPoint> };
const monthlyEvidence = new Map<number, MofFiscalMonthlyOnlyEvidence[]>();
export type MofFiscalWrongComponentEvidence = MofFiscalWrongComponent & { url: string; title: string; obsDate: Date };
const wrongEvidence = new Map<number,MofFiscalWrongComponentEvidence[]>();
// Shared promises coalesce worker members, including concurrently running members.
// The snapshot outlives the whole 88-member package. Rejected promises share the
// same 15-minute cooldown, so 88 members cannot hammer one failing archive.
const CACHE_MS = 15 * 60_000;
const responses = new Map<string, { at: number; promise: Promise<string> }>();
const snapshots = new Map<number, { at: number; promise: Promise<History> }>();
const headers = { "User-Agent": process.env.MOF_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0" };
async function getPage(url: string): Promise<string> {
  const cached = responses.get(url);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.promise;
  const promise = (async () => {
    const diskFile = path.join(process.cwd(), ".data", "mof-fiscal", "http-cache", createHash("sha256").update(url).digest("hex") + ".json");
    const bypass = process.env.MOF_FISCAL_BYPASS_CACHE === "1";
    if (!bypass) {
      try {
        const disk = JSON.parse(await readFile(diskFile,"utf8")) as { url: string; fetchedAt: number; html: string };
        const ttl = /\/index(?:_\d+)?\.htm$/.test(url) || url.endsWith("/") ? CACHE_MS : 24 * 60 * 60_000;
        if (disk.url === url && typeof disk.html === "string" && Date.now()-disk.fetchedAt < ttl) return disk.html;
      } catch { /* Missing/corrupt cache is refetched from the official source. */ }
    }
    const response = await fetchChinaOfficial(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`财政部归档 HTTP ${response.status}: ${url}`);
    const html = await response.text();
    if (!html.includes("财政收支情况")) throw new Error(`财政部归档缺少发布锚点：${url}`);
    if (!bypass) {
      await mkdir(path.dirname(diskFile), { recursive: true });
      await writeFile(diskFile,JSON.stringify({url,fetchedAt:Date.now(),html}),"utf8");
    }
    return html;
  })();
  responses.set(url, { at: Date.now(), promise });
  return promise;
}
/** Public official directory; page titles are the reference period, not publish date. */
export function parseMofFiscalArticleList(html: string, url: string): Article[] {
  const articles: Article[] = [];
  for (const x of html.matchAll(/<a\b[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = x[2]!.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    const year = Number(/(20\d{2})年/.exec(title)?.[1]);
    if (/财政收支情况/.test(title) && year) {
      const articleUrl = new URL(x[1]!, url);
      if (articleUrl.origin !== new URL(MOF_FISCAL_INDEX_URL).origin) throw new Error("财政部归档出现非官方月报链接");
      articles.push({ url: articleUrl.toString(), title, year });
    }
  }
  if (!articles.length) throw new Error(`财政部归档目录缺少财政收支月报链接：${url}`);
  return articles;
}
async function articleList(startYear: number): Promise<Article[]> {
  const all: Article[] = [];
  // Do not hardcode the current 18-page archive: pagination grows each year.
  for (let page = 0; page < 100; page++) {
    const url = page ? new URL(`index_${page}.htm`, MOF_FISCAL_INDEX_URL).toString() : MOF_FISCAL_INDEX_URL;
    const items = parseMofFiscalArticleList(await getPage(url), url);
    all.push(...items.filter(x => x.year >= startYear));
    if (items.some(x => x.year < startYear)) return [...new Map(all.map(x => [x.url, x])).values()];
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("财政部归档超过 100 页仍未到达回填起年，拒绝静默截断历史");
}
async function collectHistory(startYear: number): Promise<History> {
  const articles = await articleList(startYear);
  const values: History = new Map();
  const evidence: MofFiscalMonthlyOnlyEvidence[] = [];
  const rejected: MofFiscalWrongComponentEvidence[] = [];
  for (const article of articles) {
    // Transport or parser failure must fail the run, never masquerade as no new data.
    const html = await getPage(article.url);
    let parsed: ReturnType<typeof parseMofFiscalPage>;
    try {
      parsed = parseMofFiscalPage(html);
      if (parsed.obsDate.getUTCFullYear() !== article.year) throw new Error(`财政部目录/正文年份不一致：${article.url}`);
    } catch (error) {
      // Invalidate a structurally bad disk page; the rejected snapshot still
      // shields this worker batch, and the next backoff run refetches the source.
      const failure = new Error(`财政部月报结构解析失败（缓存已失效）：${article.url}：${error instanceof Error ? error.message : String(error)}`);
      const rejected = Promise.reject<string>(failure);
      void rejected.catch(() => undefined); // retained rejection is consumed by this batch
      responses.set(article.url,{at:Date.now(),promise:rejected});
      const diskFile = path.join(process.cwd(),".data","mof-fiscal","http-cache",createHash("sha256").update(article.url).digest("hex")+".json");
      await unlink(diskFile).catch(() => undefined);
      throw failure;
    }
    for (const item of parsed.wrongComponents) rejected.push({...item,url:article.url,title:article.title,obsDate:parsed.obsDate});
    for (const [component, measures] of parsed.monthlyOnly) evidence.push({ url: article.url, title: article.title, component, obsDate: parsed.obsDate, measures });
    for (const [component, measures] of parsed.values) for (const [measure, point] of measures) {
      const target = values.get(component) ?? new Map<FiscalMeasure, ObservationPoint[]>();
      target.set(measure, [...(target.get(measure) ?? []), point]);
      values.set(component, target);
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  for (const measures of values.values()) for (const [measure, points] of measures) {
    // Archive order is newest first; keep the newest published value for duplicate periods.
    const unique = new Map<number, ObservationPoint>();
    for (const point of points) if (!unique.has(point.obsDate.getTime())) unique.set(point.obsDate.getTime(), point);
    measures.set(measure, [...unique.values()].sort((a,b) => a.obsDate.getTime()-b.obsDate.getTime()));
  }
  if (!values.size) throw new Error("财政部归档未获取任何财政观测");
  // A later official release for the same component/period overrides a monthly-only omission.
  wrongEvidence.set(startYear,rejected);
  monthlyEvidence.set(startYear,evidence.filter(item => !values.get(item.component)?.get("amount")?.some(point => point.obsDate.getTime() === item.obsDate.getTime())));
  return values;
}
export async function fetchMofFiscalHistory(startYear = 2015): Promise<History> {
  startYear = Math.max(2015, startYear);
  const cached = snapshots.get(startYear);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.promise;
  const promise = collectHistory(startYear);
  snapshots.set(startYear, { at: Date.now(), promise });
  return promise;
}
export async function fetchMofFiscalSeries(component: string, measure: FiscalMeasure, startYear: number) {
  return (await fetchMofFiscalHistory(startYear)).get(component)?.get(measure) ?? [];
}

export async function fetchMofFiscalMonthlyOnlyEvidence(startYear = 2015) {
  startYear = Math.max(2015,startYear);
  await fetchMofFiscalHistory(startYear);
  return monthlyEvidence.get(startYear) ?? [];
}

export async function fetchMofFiscalWrongComponentEvidence(startYear = 2015) {
  startYear = Math.max(2015,startYear);
  await fetchMofFiscalHistory(startYear);
  return wrongEvidence.get(startYear) ?? [];
}
