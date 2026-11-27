import { z } from "zod";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import { aggregateDailyBars } from "@/lib/data/providers/yahooKlineProvider";
import { easternParts, equitySession } from "@/lib/equity/disclosureTiming";
import { getAdjustedDailyBars, getDailyCloseRowsDbOnly } from "@/lib/equity/equityPriceStore";
import { BENCHMARK_ETF } from "@/lib/equity/gicsCatalog";
import { loadStockContext, type StockContext } from "@/lib/equity/stockDetail";
import { loadStockEvents, type StockEvent } from "@/lib/equity/stockEvents";
import { loadStockPeers } from "@/lib/equity/stockPeers";
import { day, MarketError } from "@/lib/market/schema";
import { stockEvidence } from "./equity";
import { isCompleteChartBar, renderStockChartPng } from "./stockChartPng";
import { saveStockChartImage, saveStockEventPack } from "./stockChartArtifacts";
import { prepareResearchEventPack, researchEventPackInput } from "./stockEventPack";

const dayMs = 86_400_000;
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const dayOfBar = (time: number) => dateKey(new Date(time * 1000));
const shift = (value: string, days: number) => dateKey(new Date(Date.parse(value) + days * dayMs));
const stockUrl = (symbol: string) => absoluteUrl(`/equity/stocks/${encodeURIComponent(symbol)}`);
const priceWindow = { startDate: day, endDate: day };
const peerLimit = z.number().int().min(1).max(10).default(5);

export const stockPeersInput = stockEvidence.extend({ ...priceWindow, peerLimit });
export const stockEventReturnsInput = stockEvidence.extend({
  ...priceWindow, peerLimit,
  eventType: z.enum(["earnings_release", "quarterly_filing", "annual_filing", "8k", "split"]).default("earnings_release"),
  limit: z.number().int().min(1).max(20).default(8),
  sessionsAfter: z.number().int().min(1).max(10).default(3),
});
export const stockChartInput = stockEvidence.extend({
  ...priceWindow,
  interval: z.enum(["1d", "1w", "1M"]).default("1d"),
  adjustment: z.enum(["forward", "backward", "none"]).default("forward"),
  showEarnings: z.boolean().default(true),
});

export const stockEventPackChartInput = stockChartInput.extend({
  showEarnings: z.boolean().default(false),
  eventPack: researchEventPackInput,
});

function rangeDays(input: { startDate: string; endDate: string }, maxDays: number) {
  const days = (Date.parse(input.endDate) - Date.parse(input.startDate)) / dayMs;
  if (days < 0 || days > maxDays) throw new MarketError("INVALID_INPUT", `日期区间无效，最多 ${maxDays} 天`);
  return days + 1;
}

async function stockContext(symbol: string) {
  const canonical = symbol.toUpperCase();
  const stock = await loadStockContext(canonical)
    ?? (canonical.includes("-") ? await loadStockContext(canonical.replace("-", ".")) : null);
  if (!stock) throw new MarketError("NOT_FOUND", "站内证券目录未找到该标的");
  return stock;
}

type CloseBook = Map<string, Map<string, number>>;
async function readCloses(symbols: string[], from: string, to: string): Promise<CloseBook> {
  const rows = await getDailyCloseRowsDbOnly({ symbols, from: new Date(from), to: new Date(to) });
  const result: CloseBook = new Map();
  for (const row of rows) {
    if (!Number.isFinite(row.adjClose) || row.adjClose <= 0) continue;
    const closes = result.get(row.symbol) ?? new Map();
    closes.set(dateKey(row.date), row.adjClose);
    result.set(row.symbol, closes);
  }
  return result;
}

function performance(book: CloseBook, symbol: string, dates: string[]) {
  if (dates.length < 2) return null;
  const closes = book.get(symbol);
  if (!closes || dates.some(date => !closes.has(date))) return null;
  return closes.get(dates.at(-1)!)! / closes.get(dates[0]!)! - 1;
}

function compareWindow(book: CloseBook, symbol: string, peers: string[], dates: string[]) {
  const stockReturn = performance(book, symbol, dates);
  const spyReturn = performance(book, BENCHMARK_ETF, dates);
  const peerReturns = peers.map(ticker => ({ symbol: ticker, return: performance(book, ticker, dates) }));
  const covered = peerReturns.flatMap(row => row.return == null ? [] : [row.return]);
  const peerReturn = covered.length ? covered.reduce((sum, value) => sum + value, 0) / covered.length : null;
  return {
    stockReturn, spyReturn, peerReturn, peerReturns,
    peerCount: covered.length, requestedPeerCount: peers.length,
    excessVsSpy: stockReturn != null && spyReturn != null ? stockReturn - spyReturn : null,
    excessVsPeers: stockReturn != null && peerReturn != null ? stockReturn - peerReturn : null,
  };
}

function completedSessionCutoff() {
  const current = easternParts(new Date());
  const session = equitySession(current.date);
  const close = session?.closeMinute ?? 16 * 60;
  return current.hour * 60 + current.minute < close + 15 ? shift(current.date, -1) : current.date;
}

function selectPeers(stock: StockContext, limit: number) {
  const narrow = stock.subIndustryPeerSymbols.filter(symbol => symbol !== stock.symbol);
  const broad = stock.peerSymbols.filter(symbol => symbol !== stock.symbol);
  const eligible = narrow.length >= 2 ? narrow : broad;
  return {
    peers: eligible.slice(0, limit), eligibleCount: eligible.length,
    classification: narrow.length >= 2
      ? { level: "gics_sub_industry", name: stock.gicsSubIndustry }
      : { level: "gics_industry", name: stock.industry?.nameEn ?? null },
  };
}

export function prepareStockPeers(input: z.output<typeof stockPeersInput>) {
  const days = rangeDays(input, 5 * 366);
  return { cost: 4 + Math.ceil(days / 366) * 2 + input.peerLimit, run: async () => {
    const stock = await stockContext(input.symbol);
    const { peers, eligibleCount, classification } = selectPeers(stock, input.peerLimit);
    const { startDate, endDate } = input;
    const cutoff = completedSessionCutoff();
    const [details, book] = await Promise.all([
      loadStockPeers(stock, { symbols: [stock.symbol, ...peers], dbOnly: true }),
      readCloses([stock.symbol, BENCHMARK_ETF, ...peers], shift(startDate, -14), endDate < cutoff ? endDate : cutoff),
    ]);
    const calendar = [...(book.get(BENCHMARK_ETF)?.keys() ?? [])];
    const baseline = calendar.filter(date => date < startDate).at(-1);
    const within = calendar.filter(date => date >= startDate);
    const dates = baseline && within.length ? [baseline, within.at(-1)!] : [];
    const comparison = compareWindow(book, stock.symbol, peers, dates);
    return {
      symbol: stock.symbol, industry: details.industry,
      eligiblePeerCount: eligibleCount, peerClassification: classification,
      fundamentals: details.peers, startDate, endDate, baselineDate: dates[0] ?? null,
      firstTradingDate: within[0] ?? null, lastTradingDate: dates.at(-1) ?? null,
      ...comparison,
      returnBasis: "forward_adjusted_close",
      coverageNote: "SPY 有效日线给出共同区间，收益从起始日前最后一个交易日收盘算到区间末收盘。同行使用当前站内分类，优先选子行业，按市值排序且排除目标股；基准为有两端行情的样本等权收益。估值及报表为最新可得值，具体财期见 latestPeriod。",
      websiteUrl: stockUrl(stock.symbol),
    };
  } };
}

export function stockEventWindow(event: Pick<StockEvent, "date" | "timing">, count: number, proxySessions: string[]) {
  const { date, timing } = event;
  const session = timing?.displayBasis === "company-publication" ? timing.session
    : timing?.displayBasis === "sec-acceptance" ? timing.acceptedSession : "unknown";
  // For date-only, regular-session, or unverified times, start after the event date.
  const allowSameDay = session === "before-open";
  const candidates = Array.from({ length: 42 }, (_, index) => shift(date, index - 14));
  const useCalendar = candidates.every(candidate => equitySession(candidate) !== null);
  const calendar = useCalendar ? candidates.filter(candidate => equitySession(candidate)?.open) : proxySessions;
  const first = calendar.findIndex(candidate => allowSameDay ? candidate >= date : candidate > date);
  const dates = first >= 1 ? calendar.slice(first - 1, first + count) : [];
  return {
    dates: dates.length === count + 1 ? dates : [],
    session: session ?? "unknown", calendarBasis: useCalendar ? "nyse" : "spy_stored_sessions",
    windowBasis: allowSameDay ? "same_session_before_open" : "sessions_strictly_after_event_date",
  };
}

export function prepareStockEventReturns(input: z.output<typeof stockEventReturnsInput>) {
  const days = rangeDays(input, 5 * 366);
  return { cost: 6 + Math.ceil(days / 366) * 2 + input.peerLimit + input.limit, run: async () => {
    const stock = await stockContext(input.symbol);
    const { peers, classification } = selectPeers(stock, input.peerLimit);
    const type = { earnings_release: "8k", quarterly_filing: "earnings", annual_filing: "annual", "8k": "8k", split: "split" } as const;
    const cutoff = completedSessionCutoff();
    const requestedEnd = shift(input.endDate, 27);
    const [events, book] = await Promise.all([
      loadStockEvents(stock.symbol, {
        cik: stock.cik, from: input.startDate, to: input.endDate,
        types: [type[input.eventType]], limit: input.limit + 1, dbOnly: true,
        earningsReleasesOnly: input.eventType === "earnings_release",
      }),
      readCloses([stock.symbol, BENCHMARK_ETF, ...peers], shift(input.startDate, -14), requestedEnd < cutoff ? requestedEnd : cutoff),
    ]);
    const proxySessions = [...(book.get(BENCHMARK_ETF)?.keys() ?? [])];
    return {
      symbol: stock.symbol, eventType: input.eventType, sessionsAfter: input.sessionsAfter,
      startDate: input.startDate, endDate: input.endDate, hasMore: events.length > input.limit,
      events: events.slice(0, input.limit).map(event => {
        const { dates, ...window } = stockEventWindow(event, input.sessionsAfter, proxySessions);
        const comparison = compareWindow(book, stock.symbol, peers, dates);
        return {
          ...eventSummary(event), ...window,
          baselineDate: dates[0] ?? null, tradingDates: dates.slice(1),
          status: dates.length === 0 ? "window_unavailable" : comparison.stockReturn === null ? "price_incomplete" : "ok",
          ...comparison,
        };
      }),
      returnBasis: "forward_adjusted_close", peerSymbols: peers, peerClassification: classification,
      coverageNote: "从窗口首个交易日前一交易日收盘计算。核验为盘前的事件可含当天，其余从事件后交易日计。盘中或仅有日期时，该窗口不包含当日即时反应。未完成或缺行情返回 null。同业以当前分类成分中覆盖完整窗口者等权，排除目标股。",
      websiteUrl: stockUrl(stock.symbol),
    };
  } };
}

function eventSummary(event: StockEvent) {
  return {
    date: event.date, type: event.type, title: event.titleZh, form: event.form, accession: event.accession ?? null,
    dateBasis: event.timing?.displayBasis ?? (event.type === "split" ? "effective-date" : null),
    publishedAt: event.timing?.publishedAt ?? null, acceptedAt: event.timing?.acceptedAt ?? null,
    sourceUrl: event.url?.startsWith("https://www.sec.gov/Archives/") ? event.url : null,
  };
}

export function prepareStockEventPackChart(input: z.output<typeof stockEventPackChartInput>) {
  return prepareStockChart(input, input.eventPack);
}

export function prepareStockChart(
  input: z.output<typeof stockChartInput>,
  eventPack?: z.output<typeof researchEventPackInput>,
) {
  const days = rangeDays(input, input.interval === "1d" ? 366 : 5 * 366);
  return { cost: 6 + Math.ceil(days / 366) * 2, run: async () => {
    const stock = await stockContext(input.symbol);
    const research = eventPack && prepareResearchEventPack(eventPack, stock.symbol);
    const cutoff = completedSessionCutoff();
    const endDate = input.endDate < cutoff ? input.endDate : cutoff;
    if (input.startDate > endDate) throw new MarketError("DATA_UNAVAILABLE", "所选区间还没有已完成的交易日");
    const [prices, events] = await Promise.all([
      getAdjustedDailyBars(stock.symbol, {
        mode: input.adjustment, fromSec: Date.parse(input.startDate) / 1000, toSec: Date.parse(endDate) / 1000,
      }, { dbOnly: true }),
      input.showEarnings ? loadStockEvents(stock.symbol, {
        cik: stock.cik, from: input.startDate, to: endDate, types: ["8k"],
        earningsReleasesOnly: true, dbOnly: true, limit: 61,
      }) : [],
    ]);
    const bars = aggregateDailyBars(prices.bars, input.interval);
    const earnings = events.slice(0, 60).map(eventSummary);
    const firstTradingDate = prices.bars[0] ? dateKey(new Date(prices.bars[0].time * 1000)) : null;
    const lastBar = prices.bars.at(-1);
    const lastTradingDate = lastBar ? dateKey(new Date(lastBar.time * 1000)) : null;
    const markers = earnings.filter(event => firstTradingDate && lastTradingDate && event.date >= firstTradingDate && event.date <= lastTradingDate);
    const candleDates = new Set(bars.filter(isCompleteChartBar).map(bar => dayOfBar(bar.time)));
    // Use the eligible daily market session first, then locate its weekly or monthly candle.
    const sessions = input.interval === "1d" ? prices.bars.filter(isCompleteChartBar) : prices.bars;
    let markerNumber = 0;
    const researchEvents = research?.events.map(event => {
      const eventDate = event.occurredAt.slice(0, 10);
      const inRange = eventDate >= input.startDate && eventDate <= input.endDate;
      const session = inRange ? sessions.find(bar => dayOfBar(bar.time) >= eventDate) : undefined;
      const candle = session && aggregateDailyBars([session], input.interval)[0];
      const candleDate = candle && dayOfBar(candle.time);
      const plotted = candleDate !== undefined && candleDates.has(candleDate);
      return {
        externalId: event.externalId, title: event.title, markerLabel: event.markerLabel,
        occurredAt: event.occurredAt, eventType: event.eventType, color: event.color,
        evidenceUrls: eventPack?.events.find(row => row.externalId === event.externalId)?.sources.map(source => source.url) ?? [],
        status: plotted ? "plotted" : inRange ? "no_trading_candle" : "out_of_range",
        number: plotted ? ++markerNumber : null,
        tradingDate: plotted && session ? dayOfBar(session.time) : null,
        candleDate: plotted ? candleDate : null,
      };
    });
    const researchMarkers = researchEvents?.flatMap(event => event.number !== null && event.candleDate
      ? [{ number: event.number, candleDate: event.candleDate, color: event.color }] : []);
    const png = await renderStockChartPng(stock.symbol, bars, markers.map(event => event.date), input, researchMarkers);
    const delivery = await saveStockChartImage(stock.symbol, png.image).catch(error => {
      console.error("[research-mcp] chart image delivery failed", error);
      return { imageDeliveryNote: "浏览器预览与下载链接暂不可用，原始 PNG 仍在工具的图片响应中。" };
    });
    const researchDelivery = research && await saveStockEventPack(stock.symbol, research.document).catch(error => {
      console.error("[research-mcp] event pack delivery failed", error);
      return { eventPack: research.document, eventPackDeliveryNote: "下载链接暂不可用，可将 eventPack 对象直接保存为 JSON。" };
    });
    return {
      image: png.image, symbol: stock.symbol, interval: input.interval, adjustment: input.adjustment,
      ...delivery,
      ...(research && {
        ...researchDelivery, researchEvents, plottedEventCount: markerNumber,
        eventCoverageNote: "按事件当地日期对齐当天或区间内下一根已完成交易日，再归入对应 K 线。外部 AI 提供的证据链接随事件包保留，站内校验格式与显示范围。",
      }),
      startDate: input.startDate, endDate: input.endDate,
      firstTradingDate, lastTradingDate,
      bars: png.candleCount, events: earnings, earningsTruncated: events.length > 60,
      coverageNote: "按请求区间内已有的完整日线绘制。周线和月线只聚合区间内的交易日，首尾周期可能不足整周或整月。",
      websiteUrl: absoluteUrl(`/markets?symbol=${encodeURIComponent(stock.symbol)}`),
    };
  } };
}
