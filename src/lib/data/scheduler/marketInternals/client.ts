import { readFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { prisma } from "@/lib/prisma";
import { ensureDailyBars, syncSymbolFromRemote } from "@/lib/equity/equityPriceStore";
import { parseWikipediaSp500Html } from "@/lib/equity/wikipediaSp500";
import { normalizeSp500Ticker, parseWikipediaSp500Changes, sliceTableById } from "@/lib/equity/wikipediaSp500Changes";
import { closedDailyUpperBound, parseFrenchDaily, publishBreadth, roundPercent, trendFlags } from "./compute";
import { historicalPriceKeys, historicalDailyMembership, HISTORY_SOURCE } from "./membership";
import { WIKI_URL, WIKI_HISTORY_URL, DAILY_STYLE_PROXIES } from "./catalog";
import { fetchSsgaDailyHoldings, ssgaDailyHoldingsUrl } from "@/lib/equity/sectorEtfHoldings";
import { recordMembershipConfirmation, isConfirmedMembershipDate, readMembershipBaseline, saveMembershipBaseline, validateCorroboration } from "./membershipBaseline";

import { computeDailyStyleProxies } from "./styleProxies";

export type DailyValues = { date: string; values: Record<string, number | null> };
const cache = new Map<string, { expires: number; value: Promise<DailyValues[]> }>();
function cached(key: string, fn: () => Promise<DailyValues[]>): Promise<DailyValues[]> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = fn().catch((error) => { cache.delete(key); throw error; });
  if (cache.size > 4) cache.clear();
  cache.set(key, { expires: Date.now() + 10 * 60_000, value });
  return value;
}

async function frenchCsv(file: string): Promise<string> {
  const response = await fetch(`https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/${file}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`French日频下载失败 HTTP ${response.status}`);
  const files = Object.entries(unzipSync(new Uint8Array(await response.arrayBuffer()))).filter(([name]) => name.toLowerCase().endsWith(".csv"));
  if (files.length !== 1) throw new Error("French ZIP结构异常");
  return strFromU8(files[0][1]);
}

export function loadDailyStyles(): Promise<DailyValues[]> {
  return cached("styles", async () => {
    const [fiveCsv, momCsv] = await Promise.all([
      frenchCsv("F-F_Research_Data_5_Factors_2x3_daily_CSV.zip"),
      frenchCsv("F-F_Momentum_Factor_daily_CSV.zip"),
    ]);
    const five = parseFrenchDaily(fiveCsv, ["SMB", "HML", "RMW", "CMA"]);
    const momentum = parseFrenchDaily(momCsv, ["Mom"]);
    return [...new Set([...five.keys(), ...momentum.keys()])].filter((date) => date >= "1995-01-01").sort().map((date) => ({
      date, values: { SMB: null, HML: null, RMW: null, CMA: null, Mom: null, ...five.get(date), ...momentum.get(date) },
    }));
  });
}

export function loadDailyStyleProxies(): Promise<DailyValues[]> {
  return cached("style-proxies", async () => {
    const symbols = [...new Set(DAILY_STYLE_PROXIES.flatMap(row => [row.long, row.short]))];
    // 六只ETF完整回读，避免增量缓存中不同抓取批次的adjClose尺度在边界形成假收益。
    for (const symbol of symbols) {
      if (!await syncSymbolFromRemote(symbol, { full: true })) throw new Error(`风格代理ETF缺少有效行情: ${symbol}`);
    }
    const upperBound = closedDailyUpperBound();
    const prices = await prisma.equityDailyBar.findMany({ where: { symbol: { in: symbols }, date: { gte: new Date("1995-01-01"), lt: upperBound } }, select: { symbol: true, date: true, adjClose: true }, orderBy: { date: "asc" } });
    const rows = prices.map(row => ({ ...row, date: row.date.toISOString().slice(0, 10) }));
    return computeDailyStyleProxies(rows.filter(row => row.symbol === "SPY").map(row => row.date), rows);
  });
}

type MembershipSource = { html: string; anchor: string; source: string; corroboration?: { baselineAnchor: string; asOf: string; confirmedDates?: string[] } };
export async function loadMembershipSource(live: boolean, dependencies = { readBaseline: readMembershipBaseline, saveBaseline: saveMembershipBaseline, fetchHoldings: fetchSsgaDailyHoldings, recordConfirmation: recordMembershipConfirmation }): Promise<MembershipSource> {
  if (live) {
    try {
      const response = await fetch(WIKI_URL, { cache: "no-store", signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "GekkoTech-MarketData/1.0" } });
      if (!response.ok) throw new Error(`Wikipedia HTTP ${response.status}`);
      let html = await response.text();
      if (!sliceTableById(html, "constituents")) throw new Error("Wikipedia当前名单表结构异常");
      // 源站已把变更历史拆为独立文章；两页必须同轮重新抓取，不混用旧历史。
      if (!sliceTableById(html, "changes")) {
        const history = await fetch(WIKI_HISTORY_URL, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
        if (!history.ok) throw new Error(`Wikipedia历史 HTTP ${history.status}`);
        const table = sliceTableById(await history.text(), "changes");
        if (!table) throw new Error("Wikipedia历史表结构异常");
        html += table + "</table>";
      }
      const changes = parseWikipediaSp500Changes(html);
      if (changes.length < 300) throw new Error(`Wikipedia历史行不足: ${changes.length}`);
      const source = { html, anchor: new Date().toISOString().slice(0, 10), source: `${WIKI_URL};${WIKI_HISTORY_URL}` };
      await dependencies.saveBaseline(source);
      return source;
    } catch (error) {
      try {
        const baseline = await dependencies.readBaseline();
        const table = sliceTableById(baseline.html, "constituents");
        if (!table || parseWikipediaSp500Changes(baseline.html).length < 300) throw new Error("基线名单/历史表不完整");
        const expected = parseWikipediaSp500Html(table).map((r) => normalizeSp500Ticker(r.symbol)).filter((s): s is string => s != null);
        const holdings = await dependencies.fetchHoldings("SPY");
        // US交易所股票代码；排除现金、期货和2602335D等非上市CVR权益，不能忽略任何有效股票代码的差异。
        const actual = holdings.rows.filter((r) => r.symbol && /^[A-Z]{1,5}(?:-[A-Z])?$/.test(r.symbol)).map((r) => normalizeSp500Ticker(r.symbol!)).filter((s): s is string => s != null);
        const todayNy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        validateCorroboration(expected, actual, holdings.asOfDate, todayNy);
        const confirmedDates = await dependencies.recordConfirmation(baseline, holdings.asOfDate);
        const reason = error instanceof Error ? error.message : String(error);
        return { html: baseline.html, anchor: holdings.asOfDate,
          source: `${baseline.source};baseline=${baseline.anchor};corroborated=${ssgaDailyHoldingsUrl("SPY")};holdingsAsOf=${holdings.asOfDate};Wikipedia unavailable: ${reason}`,
          corroboration: { baselineAnchor: baseline.anchor, asOf: holdings.asOfDate, confirmedDates } };
      } catch (corroborationError) {
        throw new Error(`在线成分名单不可用，禁止自动回退旧快照：${error instanceof Error ? error.message : String(error)}；独立日度校验失败：${corroborationError instanceof Error ? corroborationError.message : String(corroborationError)}`);
      }
    }
  }
  const base = path.join(process.cwd(), "scripts/equity/fixtures");
  const [html, meta] = await Promise.all([readFile(path.join(base, "wikipedia-sp500-page.html"), "utf8"), readFile(path.join(base, "wikipedia-sp500-page.meta.json"), "utf8")]);
  return { html, anchor: (JSON.parse(meta) as { fetchedAt: string }).fetchedAt.slice(0, 10), source: "packaged-wikipedia-snapshot" };
}

export type BreadthDataset = { rows: DailyValues[]; anchor: string; source: string; calendarThrough: string | null; membershipCorroborated: boolean };

/** 分批读取每股价格，在内存线性滚动；避免逐日逐股SQL窗口/相关子查询。 */
export async function buildDailyBreadth(from = "1995-01-01", options = { live: true, refreshPrices: true }): Promise<BreadthDataset> {
  from = from < "1995-01-01" ? "1995-01-01" : from;
  const source = await loadMembershipSource(options.live);
  if (options.live && source.source === "packaged-wikipedia-snapshot") {
    throw new Error(`每日广度在线名单不可用，已有历史仅截至${source.anchor}；本轮不把陈旧名单当作最新数据`);
  }
  const table = sliceTableById(source.html, "constituents");
  if (!table) throw new Error("标普500当前名单缺失");
  const current = [...new Set(parseWikipediaSp500Html(table).map((r) => normalizeSp500Ticker(r.symbol)).filter((s): s is string => s != null))];
  if (current.length < 495 || current.length > 510) throw new Error(`标普500锚点名单规模异常: ${current.length}`);
  if (options.refreshPrices) {
    // 复用行情库自身的节流、日内缓存、失败/退市语义；不把旧价复制为新观测。
    await ensureDailyBars(["SPY", ...current]);
  }
  const upperBound = closedDailyUpperBound();
  const warmup = new Date(`${from}T00:00:00Z`);
  warmup.setUTCDate(warmup.getUTCDate() - 400);
  const calendarRows = await prisma.equityDailyBar.findMany({ where: { symbol: "SPY", date: { gte: warmup, lt: upperBound }, close: { gt: 0 } }, orderBy: { date: "asc" }, select: { date: true } });
  const calendar = calendarRows.map((r) => r.date.toISOString().slice(0, 10));
  const indexByDate = new Map(calendar.map((date, index) => [date, index]));
  const membership = historicalDailyMembership(calendar.filter((d) => d >= from && (!source.corroboration || (isConfirmedMembershipDate(d, source.corroboration.baselineAnchor, source.corroboration.asOf) || source.corroboration.confirmedDates?.includes(d)))), current, parseWikipediaSp500Changes(source.html), source.anchor);
  const totals = new Map([...membership].map(([date, members]) => [date, { members: members.size, eligible50: 0, eligible200: 0, above50: 0, above200: 0 }]));
  const symbols = [...new Set([...membership.values()].flatMap((set) => [...set]))].sort();
  for (let start = 0; start < symbols.length; start += 20) {
    const batch = symbols.slice(start, start + 20);
    const priceKeys = [...new Set(batch.flatMap((s) => [...historicalPriceKeys(s), ...historicalPriceKeys(s, "1995-01-01")]))];
    const bars = await prisma.equityDailyBar.findMany({ where: { symbol: { in: priceKeys }, date: { gte: warmup, lt: upperBound } }, orderBy: [{ symbol: "asc" }, { date: "asc" }], select: { symbol: true, date: true, close: true } });
    const bySymbol = new Map<string, { index: number; close: number }[]>();
    for (const bar of bars) {
      const index = indexByDate.get(bar.date.toISOString().slice(0, 10));
      if (index == null) continue;
      const rows = bySymbol.get(bar.symbol) ?? [];
      rows.push({ index, close: bar.close });
      bySymbol.set(bar.symbol, rows);
    }
    const flagsByKey = new Map([...bySymbol].map(([key, rows]) => [key, new Map(trendFlags(rows).map((r) => [r.index, r]))]));
    for (const symbol of batch) for (const [date, members] of membership) {
      if (!members.has(symbol)) continue;
      const index = indexByDate.get(date)!;
      const candidates = historicalPriceKeys(symbol, date).map(key => flagsByKey.get(key)?.get(index));
      const total = totals.get(date)!;
      for (const period of [50, 200] as const) {
        // 每个窗口只使用单一来源的连续价格；不跨归档/Yahoo拼接不同价格刻度。
        const flag = candidates.find(row => row?.[`above${period}`] != null)?.[`above${period}`];
        if (flag != null) { total[`eligible${period}`]++; if (flag) total[`above${period}`]++; }
      }
    }
  }
  const rows = [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([date, r]) => ({ date, values: {
    above50: publishBreadth(r.above50, r.eligible50, r.members),
    above200: publishBreadth(r.above200, r.eligible200, r.members),
    coverage50: r.members >= 495 && r.members <= 510 ? roundPercent(100 * r.eligible50 / r.members) : null,
    coverage200: r.members >= 495 && r.members <= 510 ? roundPercent(100 * r.eligible200 / r.members) : null,
  } }));
  return { rows, anchor: source.anchor, source: `${HISTORY_SOURCE};${source.source};Quandl WIKI frozen 2018 archive; Yahoo CC0 frozen public snapshots (isolated Y20/Y22 price windows)`, calendarThrough: [...membership.keys()].at(-1) ?? null, membershipCorroborated: Boolean(source.corroboration) };
}

const breadthCache = new Map<string, { expires: number; promise: Promise<BreadthDataset> }>();
export function loadDailyBreadth(from: string): Promise<BreadthDataset> {
  const hit = breadthCache.get(from);
  if (hit && hit.expires > Date.now()) return hit.promise;
  if (breadthCache.size > 3) breadthCache.clear();
  const promise = buildDailyBreadth(from).catch((error) => { breadthCache.delete(from); throw error; });
  breadthCache.set(from, { expires: Date.now() + 30 * 60_000, promise });
  return promise;
}
