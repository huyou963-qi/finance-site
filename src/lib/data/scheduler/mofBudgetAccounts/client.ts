import type { ObservationPoint } from "../types";
import { fetchChinaOfficial } from "../chinaOfficialProxy";
import { MOF_BUDGET_ACCOUNTS_INDEX_URL, MOF_BUDGET_ACCOUNTS_SERIES } from "./catalog";
import { extractLinks, findBudgetTableLinks, parseBudgetTable, valueForSeries } from "./parsePage";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const TTL = 30 * 60_000;
const pages = new Map<string, { at: number; promise: Promise<string> }>();
let queue: Promise<unknown> = Promise.resolve();
/** In-flight promise caching and one request queue shared by all subscriptions. */
async function page(url: string): Promise<string> {
  if (new URL(url).origin !== "https://yss.mof.gov.cn") throw new Error(`财政决算链接超出官方源范围: ${url}`);
  const hit = pages.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.promise;
  const promise = queue.then(async () => {
    const cachePath = join(process.cwd(), ".data", "mof-budget-accounts", `${createHash("sha256").update(url).digest("hex")}.json`);
    if (process.env.MOF_BUDGET_BYPASS_CACHE !== "1") {
      try {
        const cached = JSON.parse(await readFile(cachePath, "utf8")) as { url: string; fetchedAt: string; html: string };
        const age = Date.now() - new Date(cached.fetchedAt).getTime();
        if (cached.url === url && age >= 0 && age < 24 * 60 * 60_000 && typeof cached.html === "string") return cached.html;
      } catch { /* A cache miss or incomplete cache file requires the official source. */ }
    }
    await new Promise(resolve => setTimeout(resolve, 350));
    const response = await fetchChinaOfficial(url, { headers: { "User-Agent": process.env.MOF_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0" }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`财政部年度决算 HTTP ${response.status}: ${url}`);
    if (new URL(response.url).hostname !== "yss.mof.gov.cn" || /404/.test(response.url)) throw new Error(`财政部年度决算发生异常重定向: ${url}`);
    const html = await response.text();
    await mkdir(join(process.cwd(), ".data", "mof-budget-accounts"), { recursive: true });
    await writeFile(cachePath, JSON.stringify({ url, fetchedAt: new Date().toISOString(), html }), "utf8");
    return html;
  });
  queue = promise.catch(() => undefined);
  pages.set(url, { at: Date.now(), promise });
  try { return await promise; } catch (error) { pages.delete(url); throw error; }
}
export async function discoverBudgetYears(): Promise<{ year: number; url: string }[]> {
  const html = await page(MOF_BUDGET_ACCOUNTS_INDEX_URL);
  const found = extractLinks(html, MOF_BUDGET_ACCOUNTS_INDEX_URL).flatMap(x => {
    const match = /(20\d{2})年全国财政决算/.exec(x.title);
    return match ? [{ year: Number(match[1]), url: x.url }] : [];
  });
  if (!found.length) throw new Error("财政部首页未发现全国财政决算年度目录");
  const years = new Map(found.map(x => [x.year, x]));
  // Archived official directory names predate the current YYYYzyjs convention.
  for (const [year, path] of [[2018, "2018czjs/"], [2019, "2019qgczjs/"]] as const) {
    years.set(year, { year, url: new URL(path, MOF_BUDGET_ACCOUNTS_INDEX_URL).href });
  }
  for (let year = 2020; year < Math.max(...found.map(x => x.year)); year++) {
    if (!years.has(year)) years.set(year, { year, url: new URL(`${year}zyjs/`, MOF_BUDGET_ACCOUNTS_INDEX_URL).href });
  }
  return [...years.values()].sort((a, b) => a.year - b.year);
}
let history: { at: number; promise: Promise<Map<string, ObservationPoint[]>> } | undefined;
const tableCoverage = new Map<string, number>();
export async function fetchMofBudgetAccountsTableCoverage(): Promise<Map<string, number>> {
  await fetchMofBudgetAccountsHistory();
  return new Map(tableCoverage);
}
export async function fetchMofBudgetAccountsHistory(): Promise<Map<string, ObservationPoint[]>> {
  if (history && Date.now() - history.at < TTL) return history.promise;
  const promise = (async () => {
    const values = new Map<string, ObservationPoint[]>();
    const completeCoverage = new Map<string, number>();
    for (const { year, url } of await discoverBudgetYears()) {
      let indexHtml = await page(url);
      const pageCount = Number(/(?:var\s+)?countPage\s*=\s*(\d+)/.exec(indexHtml)?.[1] ?? 1);
      if (pageCount > 10) throw new Error("财政决算目录分页数异常");
      for (let n = 1; n < pageCount; n++) indexHtml += await page(new URL(`index_${n}.htm`, url).href);
      const links = findBudgetTableLinks(indexHtml, url, year);
      for (const link of links) {
        const rows = parseBudgetTable(await page(link.url), year, link.scope, link.table);
        completeCoverage.set(`${link.scope}_${link.table}`, year);
        for (const series of MOF_BUDGET_ACCOUNTS_SERIES.filter(x => x.scope === link.scope && x.table === link.table)) {
          const value = valueForSeries(rows, series);
          if (value === null) continue;
          const points = values.get(series.key) ?? [];
          points.push({ obsDate: new Date(Date.UTC(year, 0, 1)), value });
          values.set(series.key, points);
        }
      }
    }
    if (!values.get("national_capital_revenue")?.length || !values.get("national_social_revenue")?.length) throw new Error("第三第四本账全国总量缺失");
    tableCoverage.clear();
    for (const [key, year] of completeCoverage) tableCoverage.set(key, year);
    return values;
  })();
  history = { at: Date.now(), promise };
  try { return await promise; } catch (error) {
    // A worker batch may contain hundreds of members of the same official
    // snapshot. Share the rejection too: never turn one outage into hundreds
    // of archive retries. It remains FAILED; a later invocation retries after
    // the normal subscription backoff, with a fresh process/cache window.
    history = { at: Date.now(), promise };
    throw error;
  }
}
export async function fetchMofBudgetAccountSeries(key: string, fromYear = 2018) {
  if (!MOF_BUDGET_ACCOUNTS_SERIES.some(x => x.key === key)) throw new Error(`未知年度决算指标 ${key}`);
  return ((await fetchMofBudgetAccountsHistory()).get(key) ?? []).filter(x => x.obsDate.getUTCFullYear() >= fromYear);
}
