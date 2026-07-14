/**
 * 美股日线价格持久层：db-first + 缺口增量拼接。
 *
 * - 覆盖任意美股代码（不限 S&P500 成分），首次访问按 range=max 全量回填。
 * - 表：mds.equity_daily_bar（Yahoo quote 口径）、mds.equity_split（精确拆股）、
 *       mds.equity_price_coverage（每标的回填状态，取代进程内 TTL）。
 * - 三种复权由 priceAdjustment.ts 精确计算；库内只存原始口径，不存派生值。
 *
 * 设计依据：docs/research/US_EQUITY_STOCK_DRILLDOWN_DESIGN.md
 */

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  adjustDailyBars,
  sanitizeRawDailyBars,
  type AdjustedBar,
  type PriceAdjustmentMode,
  type RawDailyBar,
  type SplitEvent,
} from "@/lib/equity/priceAdjustment";
import {
  fetchYahooChart,
  FULL_HISTORY_PERIOD1,
  YahooSymbolNotFoundError,
  type YahooBar,
  type YahooSplit,
} from "@/lib/equity/yahooChart";
import type { ClosePoint } from "@/lib/equity/sectorReturns";

const DAY_SEC = 86400;
const BATCH_DELAY_MS = 80;
/** 尾部新鲜度：距上次远端检查不足此时长且已是最新交易日，则不再打远端 */
const FRESH_TTL_MS = 30 * 60 * 1000;
/** 确认不存在的标的，冷却期内不重试 */
const NOT_FOUND_TTL_MS = 24 * 60 * 60 * 1000;
const UPSERT_CHUNK = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Yahoo 时间戳（开盘时刻）→ 当日 UTC 零点秒 */
function toUtcDayStartSec(timeSec: number): number {
  return Math.floor(timeSec / DAY_SEC) * DAY_SEC;
}

function isWeekendUtc(daySec: number): boolean {
  const dow = new Date(daySec * 1000).getUTCDay();
  return dow === 0 || dow === 6;
}

/** 最近一个「应已收盘」的交易日（不含节假日日历，故允许 1 日误差由 TTL 兜底） */
function lastCompleteTradingDaySec(nowSec = Math.floor(Date.now() / 1000)): number {
  let day = toUtcDayStartSec(nowSec) - DAY_SEC;
  while (isWeekendUtc(day)) day -= DAY_SEC;
  return day;
}

function dateOnly(daySec: number): Date {
  return new Date(daySec * 1000);
}

// ---------------------------------------------------------------- 落库

async function upsertBars(
  symbol: string,
  bars: readonly YahooBar[],
  source: string,
): Promise<number> {
  if (bars.length === 0) return 0;

  // 按 UTC 日去重（Yahoo 偶发盘中重复帧，保留最后一条）
  const byDay = new Map<number, YahooBar>();
  for (const b of bars) byDay.set(toUtcDayStartSec(b.time), b);
  const rows = [...byDay.entries()].sort((a, b) => a[0] - b[0]);

  let written = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const values = chunk.map(([daySec, b]) =>
      Prisma.sql`(${randomUUID()}::uuid, ${symbol}, ${dateOnly(daySec)}::date, ${b.open}, ${b.high}, ${b.low}, ${b.close}, ${b.adjClose}, ${b.volume}, ${source}, CURRENT_TIMESTAMP)`,
    );
    written += await prisma.$executeRaw`
      INSERT INTO "mds"."equity_daily_bar"
        ("id", "symbol", "date", "open", "high", "low", "close", "adj_close", "volume", "source", "updated_at")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("symbol", "date") DO UPDATE SET
        "open" = EXCLUDED."open",
        "high" = EXCLUDED."high",
        "low" = EXCLUDED."low",
        "close" = EXCLUDED."close",
        "adj_close" = EXCLUDED."adj_close",
        "volume" = EXCLUDED."volume",
        "source" = EXCLUDED."source",
        "updated_at" = CURRENT_TIMESTAMP
    `;
  }
  return written;
}

async function upsertSplits(symbol: string, splits: readonly YahooSplit[]): Promise<void> {
  if (splits.length === 0) return;
  const values = splits.map(
    (s) =>
      Prisma.sql`(${randomUUID()}::uuid, ${symbol}, ${new Date(`${s.exDate}T00:00:00.000Z`)}::date, ${s.ratio}, ${s.numerator}, ${s.denominator})`,
  );
  await prisma.$executeRaw`
    INSERT INTO "mds"."equity_split"
      ("id", "symbol", "ex_date", "ratio", "numerator", "denominator")
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("symbol", "ex_date") DO UPDATE SET
      "ratio" = EXCLUDED."ratio",
      "numerator" = EXCLUDED."numerator",
      "denominator" = EXCLUDED."denominator"
  `;
}

// ---------------------------------------------------------------- 远端回补

type CoverageRow = {
  symbol: string;
  firstDate: Date | null;
  lastDate: Date | null;
  fullHistory: boolean;
  lastCheckedAt: Date | null;
  notFound: boolean;
  source: string | null;
};

async function readCoverage(symbols: string[]): Promise<Map<string, CoverageRow>> {
  if (symbols.length === 0) return new Map();
  const rows = await prisma.equityPriceCoverage.findMany({
    where: { symbol: { in: symbols } },
  });
  return new Map(rows.map((r) => [r.symbol, r as CoverageRow]));
}

async function writeCoverage(
  symbol: string,
  patch: Partial<Omit<CoverageRow, "symbol">>,
): Promise<void> {
  await prisma.equityPriceCoverage.upsert({
    where: { symbol },
    create: { symbol, ...patch },
    update: patch,
  });
}

/**
 * 拉取并落库。首次（未 fullHistory）取 range=max 全量；之后按 period1 增量拉尾部并拼接。
 * 返回 null 表示远端确认无此标的。
 */
export async function syncSymbolFromRemote(
  symbol: string,
  opts: { full?: boolean; sinceSec?: number } = {},
): Promise<{ barCount: number; splitCount: number; source: string } | null> {
  const sym = normalizeSymbol(symbol);
  try {
    const wantFull = opts.full || opts.sinceSec == null;
    const nowSec = Math.floor(Date.now() / 1000);
    const chart = await fetchYahooChart(sym, {
      // period1=0 取上市首日起的真日线；勿用 range=max（Yahoo 会降采样成月线）
      period1: wantFull ? FULL_HISTORY_PERIOD1 : opts.sinceSec! - 10 * DAY_SEC,
      period2: nowSec + DAY_SEC,
      interval: "1d",
    });

    if (chart.bars.length === 0) {
      await writeCoverage(sym, { lastCheckedAt: new Date() });
      return null;
    }

    await upsertBars(sym, chart.bars, "yahoo");
    // 拆股只在全量拉取时可靠（增量窗口不含历史事件）
    if (wantFull) await upsertSplits(sym, chart.splits);

    const first = toUtcDayStartSec(chart.bars[0]!.time);
    const last = toUtcDayStartSec(chart.bars[chart.bars.length - 1]!.time);
    await writeCoverage(sym, {
      lastCheckedAt: new Date(),
      notFound: false,
      source: "yahoo",
      lastDate: dateOnly(last),
      ...(wantFull ? { firstDate: dateOnly(first), fullHistory: true } : {}),
    });

    return { barCount: chart.bars.length, splitCount: chart.splits.length, source: "yahoo" };
  } catch (e) {
    if (e instanceof YahooSymbolNotFoundError) {
      await writeCoverage(sym, { notFound: true, lastCheckedAt: new Date() });
      return null;
    }
    throw e;
  }
}

/** 判断是否需要打远端 */
function needsRemote(
  cov: CoverageRow | undefined,
  wantFromSec: number | null,
  nowMs: number,
): "full" | "tail" | null {
  if (!cov) return "full";
  if (cov.notFound) {
    const age = cov.lastCheckedAt ? nowMs - cov.lastCheckedAt.getTime() : Infinity;
    return age > NOT_FOUND_TTL_MS ? "full" : null;
  }
  if (!cov.fullHistory) return "full";

  // 请求区间早于已回填起点：全量已拉过，说明起点即上市首日，无需再拉
  void wantFromSec;

  const freshAge = cov.lastCheckedAt ? nowMs - cov.lastCheckedAt.getTime() : Infinity;
  if (freshAge < FRESH_TTL_MS) return null;

  const lastSec = cov.lastDate ? Math.floor(cov.lastDate.getTime() / 1000) : 0;
  return lastSec < lastCompleteTradingDaySec(Math.floor(nowMs / 1000)) ? "tail" : null;
}

// ---------------------------------------------------------------- 读取

type DbBarRow = {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  adjClose: number;
  volume: number | null;
};

function rowToRaw(r: DbBarRow): RawDailyBar {
  return {
    time: Math.floor(r.date.getTime() / 1000),
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    adjClose: r.adjClose,
    volume: r.volume,
  };
}

async function readSplits(symbols: string[]): Promise<Map<string, SplitEvent[]>> {
  if (symbols.length === 0) return new Map();
  const rows = await prisma.equitySplit.findMany({
    where: { symbol: { in: symbols } },
    orderBy: [{ symbol: "asc" }, { exDate: "asc" }],
    select: { symbol: true, exDate: true, ratio: true },
  });
  const out = new Map<string, SplitEvent[]>();
  for (const r of rows) {
    const list = out.get(r.symbol) ?? [];
    list.push({ exDate: r.exDate.toISOString().slice(0, 10), ratio: r.ratio });
    out.set(r.symbol, list);
  }
  return out;
}

/**
 * 确保 symbols 的日线已回填至最新（缺口拼接），返回确实无数据的标的。
 */
export async function ensureDailyBars(symbols: string[]): Promise<{ missing: string[] }> {
  const unique = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
  const nowMs = Date.now();
  const coverage = await readCoverage(unique);
  const missing: string[] = [];

  for (const sym of unique) {
    const cov = coverage.get(sym);
    const action = needsRemote(cov, null, nowMs);
    if (!action) {
      if (cov?.notFound) missing.push(sym);
      continue;
    }
    const sinceSec =
      action === "tail" && cov?.lastDate
        ? Math.floor(cov.lastDate.getTime() / 1000)
        : undefined;
    const res = await syncSymbolFromRemote(sym, {
      full: action === "full",
      sinceSec,
    });
    if (!res) missing.push(sym);
    await sleep(BATCH_DELAY_MS);
  }

  return { missing };
}

export type DailyBarsQuery = {
  /** 复权模式，默认 forward */
  mode?: PriceAdjustmentMode;
  /** 返回区间（UTC 秒，含端点）；省略则返回全部 */
  fromSec?: number;
  toSec?: number;
  /** 只保留最后 N 根（在区间过滤之后） */
  limit?: number;
};

/**
 * 单标的复权日线。后复权锚定库内最早一根，故先取全序列复权再裁剪区间——
 * 这样切换区间时后复权刻度不会跳变。
 */
export async function getAdjustedDailyBars(
  symbol: string,
  query: DailyBarsQuery = {},
): Promise<{ bars: AdjustedBar[]; source: string | null; found: boolean }> {
  const sym = normalizeSymbol(symbol);
  const { missing } = await ensureDailyBars([sym]);
  if (missing.includes(sym)) return { bars: [], source: null, found: false };

  const [rows, splitsBySymbol, cov] = await Promise.all([
    prisma.equityDailyBar.findMany({
      where: { symbol: sym },
      orderBy: { date: "asc" },
      select: {
        date: true,
        open: true,
        high: true,
        low: true,
        close: true,
        adjClose: true,
        volume: true,
      },
    }),
    readSplits([sym]),
    prisma.equityPriceCoverage.findUnique({ where: { symbol: sym } }),
  ]);

  if (rows.length === 0) return { bars: [], source: null, found: false };

  const raw = sanitizeRawDailyBars(rows.map(rowToRaw));
  if (raw.length === 0) return { bars: [], source: null, found: false };
  const adjusted = adjustDailyBars(raw, splitsBySymbol.get(sym) ?? [], query.mode ?? "forward");

  let out = adjusted;
  if (query.fromSec != null) out = out.filter((b) => b.time >= query.fromSec!);
  if (query.toSec != null) out = out.filter((b) => b.time <= query.toSec!);
  if (query.limit != null && query.limit > 0 && out.length > query.limit) {
    out = out.slice(-query.limit);
  }

  return { bars: out, source: cov?.source ?? "yahoo", found: true };
}

/**
 * 批量复权收盘价（收益计算专用，一律用前复权 = 总收益口径）。
 * drop-in 兼容旧的 fetchSymbolDailyCloses 签名。
 */
export async function getDailyClosesDbFirst(
  symbols: string[],
  limit = 320,
): Promise<{
  closes: Record<string, ClosePoint[]>;
  source: string | null;
  missing: string[];
}> {
  const unique = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
  if (unique.length === 0) return { closes: {}, source: null, missing: [] };

  const { missing } = await ensureDailyBars(unique);
  const usable = unique.filter((s) => !missing.includes(s));

  const [rows, splitsBySymbol] = await Promise.all([
    prisma.equityDailyBar.findMany({
      where: { symbol: { in: usable } },
      orderBy: [{ symbol: "asc" }, { date: "asc" }],
      select: {
        symbol: true,
        date: true,
        open: true,
        high: true,
        low: true,
        close: true,
        adjClose: true,
        volume: true,
      },
    }),
    readSplits(usable),
  ]);

  const rawBySymbol = new Map<string, RawDailyBar[]>();
  for (const r of rows) {
    const list = rawBySymbol.get(r.symbol) ?? [];
    list.push(rowToRaw(r));
    rawBySymbol.set(r.symbol, list);
  }

  const closes: Record<string, ClosePoint[]> = {};
  const notUsable = [...missing];
  for (const sym of usable) {
    const raw = sanitizeRawDailyBars(rawBySymbol.get(sym) ?? []);
    if (raw.length < 2) {
      notUsable.push(sym);
      continue;
    }
    // 前复权 close 即 adjClose（总收益），收益计算的正确口径
    const adj = adjustDailyBars(raw, splitsBySymbol.get(sym) ?? [], "forward");
    const pts = adj.map((b) => ({ time: b.time, close: b.close }));
    closes[sym] = limit > 0 && pts.length > limit ? pts.slice(-limit) : pts;
  }

  return { closes, source: "yahoo", missing: [...new Set(notUsable)] };
}

/**
 * 只读库的每标的最新收盘价（不触发远端回补）。
 * 供全市场聚合视图（sectors 首页 500+ 只）低成本现算估值；缺价的 symbol 不在结果里。
 * 最新一根的原始 close 即当前价（拆股调整只影响历史根），无需走复权管线。
 */
export async function getLatestClosesDbOnly(symbols: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ symbol: string; close: number }[]>`
    SELECT DISTINCT ON (symbol) symbol, close
    FROM mds.equity_daily_bar
    WHERE symbol = ANY(${unique}) AND close > 0
    ORDER BY symbol, date DESC
  `;
  return new Map(rows.map((r) => [r.symbol, Number(r.close)]));
}
