import { civilTimeInZoneToUtc } from "../civilTime";
import type { EconomicCalendarEvent } from "../economicCalendar/types";
import { FRED_RELEASE_NAMES, fredReleaseIdsForPackage } from "./catalog";
import type { FredReleaseCalendar } from "./client";

/**
 * FRED `/fred/release/dates` 只给日期，不给时刻。美国统计发布绝大多数在
 * 美东 8:30，最晚的（如 MTIS / 成屋销售）在 10:00。这里统一取 8:30 作为
 * 当日首次探测点，晚于它的发布由 `postReleaseProbeHours` 继续探测兜住——
 * 宁可当天多探几次，也不要像 TE 那样把时刻记错 8 小时。
 */
export const FRED_RELEASE_TIME_ZONE = "America/New_York";
export const FRED_RELEASE_HOUR_ET = 8;
export const FRED_RELEASE_MINUTE_ET = 30;

export type FredReleaseOccurrence = {
  releaseId: number;
  /** YYYY-MM-DD */
  date: string;
  releaseAt: Date;
};

function parseYmd(date: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  // 只匹配格式不够：civilTimeInZoneToUtc 会把 2026-13-99 这种越界值静默进位成
  // 2027-04-09。用 Date.UTC 回环校验，顺带挡掉 2026-02-30 这类不存在的日期。
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  return { y, m, d };
}

export function fredReleaseAtFromDate(date: string): Date | null {
  const parts = parseYmd(date);
  if (!parts) return null;
  return civilTimeInZoneToUtc(
    parts.y,
    parts.m,
    parts.d,
    FRED_RELEASE_HOUR_ET,
    FRED_RELEASE_MINUTE_ET,
    FRED_RELEASE_TIME_ZONE,
  );
}

/** 展开某发布包关心的全部 release 的发布时刻，按时间升序。 */
export function fredReleaseOccurrencesForPackage(
  calendar: FredReleaseCalendar,
  packageId: string,
): FredReleaseOccurrence[] {
  const releaseIds = fredReleaseIdsForPackage(packageId);
  if (!releaseIds) return [];
  const out: FredReleaseOccurrence[] = [];
  for (const releaseId of releaseIds) {
    for (const date of calendar.datesByRelease.get(releaseId) ?? []) {
      const releaseAt = fredReleaseAtFromDate(date);
      if (releaseAt) out.push({ releaseId, date, releaseAt });
    }
  }
  out.sort((a, b) => a.releaseAt.getTime() - b.releaseAt.getTime());
  return out;
}

/**
 * 下一次发布。与 TE 的 `findNextCalendarRelease` 一样留 60 秒宽限，
 * 避免刚好卡在发布时刻的抖动。
 */
export function nextFredRelease(
  occurrences: FredReleaseOccurrence[],
  from: Date,
): FredReleaseOccurrence | null {
  const fromMs = from.getTime() - 60_000;
  for (const occ of occurrences) {
    if (occ.releaseAt.getTime() >= fromMs) return occ;
  }
  return null;
}

/**
 * 最近一次**已经发生**的发布。TE 日历给不出这个，而它正是补抓判定的依据：
 * 「上一期发布日已过，但我们在那之后没跑过」⇒ 漏抓，需要立刻补。
 */
export function lastFredReleaseBefore(
  occurrences: FredReleaseOccurrence[],
  from: Date,
): FredReleaseOccurrence | null {
  let last: FredReleaseOccurrence | null = null;
  const fromMs = from.getTime();
  for (const occ of occurrences) {
    if (occ.releaseAt.getTime() > fromMs) break;
    last = occ;
  }
  return last;
}

export function fredReleaseToCalendarEvent(
  occurrence: FredReleaseOccurrence,
): EconomicCalendarEvent {
  const name = FRED_RELEASE_NAMES[occurrence.releaseId] ?? `FRED release ${occurrence.releaseId}`;
  return {
    eventId: `fred-release:${occurrence.releaseId}:${occurrence.date}`,
    title: name,
    countryCode: "US",
    releaseAt: occurrence.releaseAt,
    importance: null,
    currency: null,
  };
}
