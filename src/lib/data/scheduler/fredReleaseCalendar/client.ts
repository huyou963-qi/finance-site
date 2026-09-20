import { getFredRateLimiter } from "../fredRateLimiter";
import { allRegisteredFredReleaseIds } from "./catalog";

const FRED_RELEASE_DATES_URL = "https://api.stlouisfed.org/fred/release/dates";

/**
 * 按 release 逐个取，而不是用 `/fred/releases/dates` 一把梭。
 *
 * 实测（2026-09-20，香港机房）：全量端点在 165 天窗口下 count=3882，
 * limit=1000 时 offset=0 只要 0.36s，但 offset=1000 / 2000 直接 504（60s 网关超时），
 * offset=3000 也要 59.6s —— 深翻页在 FRED 侧就是不可用的。
 * 而 `/fred/release/dates?release_id=N` 每次只返回十几行，稳定在百毫秒级。
 * 注册表只有 ~55 个 release，配合 FRED 限流器（600ms 间隔）一轮约 35 秒，
 * 对每小时一次的日历同步完全可接受。
 */
export type FredReleaseCalendar = {
  /** release id → 升序去重的发布日（含已过去的） */
  datesByRelease: Map<number, string[]>;
  rowCount: number;
  /** 单个 release 拉取失败不影响其余；失败的走原有 TE 回退 */
  failedReleaseIds: number[];
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type ReleaseDatesResponse = {
  release_dates?: Array<{ release_id?: number; date?: string }>;
};

/**
 * 拉取窗口内指定 release 的发布日。
 *
 * 关键点：`include_release_dates_with_no_data=true` 才会返回**未来**的计划发布日；
 * 默认只返回已经有数据的（即已发生的）。窗口同时向前覆盖一段时间，调用方才能
 * 判断「上一期发布日过去了但我们没抓到」并补抓 —— 这正是 TE 给不了的信息。
 */
export async function fetchFredReleaseCalendar(options: {
  dateFrom: Date;
  dateTo: Date;
  releaseIds?: readonly number[];
  apiKey?: string;
  signal?: AbortSignal;
}): Promise<FredReleaseCalendar> {
  const apiKey = (options.apiKey ?? process.env.FRED_API_KEY)?.trim();
  if (!apiKey) {
    throw new Error("未配置 FRED_API_KEY（请在 .env.local 中设置）");
  }

  const releaseIds = options.releaseIds ?? allRegisteredFredReleaseIds();
  const limiter = getFredRateLimiter();
  const datesByRelease = new Map<number, string[]>();
  const failedReleaseIds: number[] = [];
  let rowCount = 0;

  for (const releaseId of releaseIds) {
    const url =
      `${FRED_RELEASE_DATES_URL}?release_id=${releaseId}` +
      `&api_key=${encodeURIComponent(apiKey)}&file_type=json` +
      `&sort_order=asc&include_release_dates_with_no_data=true` +
      `&realtime_start=${ymd(options.dateFrom)}&realtime_end=${ymd(options.dateTo)}`;

    try {
      const res = await limiter.fetch(url, { signal: options.signal });
      if (!res.ok) {
        failedReleaseIds.push(releaseId);
        continue;
      }
      const json = (await res.json()) as ReleaseDatesResponse;
      const seen = new Set<string>();
      const dates: string[] = [];
      for (const row of json.release_dates ?? []) {
        const date = row.date;
        if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        if (seen.has(date)) continue;
        seen.add(date);
        dates.push(date);
      }
      if (dates.length > 0) {
        dates.sort();
        datesByRelease.set(releaseId, dates);
        rowCount += dates.length;
      }
    } catch {
      failedReleaseIds.push(releaseId);
    }
  }

  if (datesByRelease.size === 0) {
    throw new Error(
      `FRED 发布日历：${releaseIds.length} 个 release 全部拉取失败（网络或 API key 问题）`,
    );
  }
  return { datesByRelease, rowCount, failedReleaseIds };
}

/** 默认窗口：过去 `pastDays` 天（用于补抓判定）+ 未来 `futureDays` 天。 */
export function defaultFredCalendarWindow(from = new Date()): {
  dateFrom: Date;
  dateTo: Date;
} {
  const pastDays = positiveEnv("FRED_CALENDAR_PAST_DAYS", 45);
  const futureDays = positiveEnv("FRED_CALENDAR_FUTURE_DAYS", 120);
  const dateFrom = new Date(from);
  dateFrom.setUTCDate(dateFrom.getUTCDate() - pastDays);
  const dateTo = new Date(from);
  dateTo.setUTCDate(dateTo.getUTCDate() + futureDays);
  return { dateFrom, dateTo };
}

function positiveEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
