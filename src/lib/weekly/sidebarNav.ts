import type { WeeklyReportListItem } from "@/lib/data/weeklyReports";

const RECENT_SIDEBAR_COUNT = 8;

export function regimeShort(regime: string): string {
  return regime.split(" / ")[0] ?? regime;
}

/** weekEnding (YYYY-MM-DD, typically Friday) → `input[type=week]` value */
export function weekEndingToIsoWeekValue(weekEnding: string): string {
  const d = new Date(`${weekEnding}T12:00:00Z`);
  const { isoYear, isoWeek } = getIsoWeekParts(d);
  return `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

/** `YYYY-Www` → that ISO week's Friday (YYYY-MM-DD) */
export function isoWeekValueToFriday(isoWeek: string): string | null {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(isoWeek.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1 || week > 53) return null;

  const monday = isoWeekMondayUtc(year, week);
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);
  return friday.toISOString().slice(0, 10);
}

function getIsoWeekParts(date: Date): { isoYear: number; isoWeek: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { isoYear, isoWeek };
}

function isoWeekMondayUtc(year: number, week: number): Date {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const monday = new Date(simple);
  if (dow <= 4) {
    monday.setUTCDate(simple.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  } else {
    monday.setUTCDate(simple.getUTCDate() + (8 - dow));
  }
  return monday;
}

function parseWeekEnding(s: string): Date {
  return new Date(`${s}T12:00:00Z`);
}

/** Exact weekEnding match, else latest report whose weekEnding falls in the same ISO week */
export function findReportForIsoWeek(
  list: WeeklyReportListItem[],
  isoWeek: string,
): WeeklyReportListItem | null {
  const friday = isoWeekValueToFriday(isoWeek);
  if (!friday) return null;

  const exact = list.find((r) => r.meta.weekEnding === friday);
  if (exact) return exact;

  const monday = isoWeekMondayUtc(
    Number(/^(\d{4})/.exec(isoWeek)![1]),
    Number(/W(\d{1,2})$/.exec(isoWeek)![1]),
  );
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const inWeek = list.filter((r) => {
    const d = parseWeekEnding(r.meta.weekEnding);
    return d >= monday && d <= sunday;
  });
  if (inWeek.length === 0) return null;
  return inWeek.reduce((a, b) =>
    parseWeekEnding(a.meta.weekEnding) >= parseWeekEnding(b.meta.weekEnding) ? a : b,
  );
}

export function findLatestReport(list: WeeklyReportListItem[]): WeeklyReportListItem | null {
  return list[0] ?? null;
}

export function findLatestInPreviousMonth(
  list: WeeklyReportListItem[],
  ref: Date = new Date(),
): WeeklyReportListItem | null {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const prevY = m === 0 ? y - 1 : y;
  const prevM = m === 0 ? 11 : m - 1;

  const hits = list.filter((r) => {
    const d = parseWeekEnding(r.meta.weekEnding);
    return d.getUTCFullYear() === prevY && d.getUTCMonth() === prevM;
  });
  return hits[0] ?? null;
}

export function findLatestInPreviousQuarter(
  list: WeeklyReportListItem[],
  ref: Date = new Date(),
): WeeklyReportListItem | null {
  const y = ref.getUTCFullYear();
  const q = Math.floor(ref.getUTCMonth() / 3);
  let prevY = y;
  let prevQ = q - 1;
  if (prevQ < 0) {
    prevQ = 3;
    prevY -= 1;
  }
  const monthStart = prevQ * 3;
  const monthEnd = monthStart + 2;

  const hits = list.filter((r) => {
    const d = parseWeekEnding(r.meta.weekEnding);
    const my = d.getUTCFullYear();
    const mm = d.getUTCMonth();
    return my === prevY && mm >= monthStart && mm <= monthEnd;
  });
  return hits[0] ?? null;
}

/** Sidebar cards: recent N, plus pinned selection if outside recent */
export function buildSidebarDisplayList(
  list: WeeklyReportListItem[],
  selectedId: string | null,
  recentCount = RECENT_SIDEBAR_COUNT,
): { items: WeeklyReportListItem[]; pinnedOutsideRecent: boolean } {
  const recent = list.slice(0, recentCount);
  if (!selectedId) return { items: recent, pinnedOutsideRecent: false };

  const selected = list.find((r) => r.id === selectedId);
  if (!selected || recent.some((r) => r.id === selectedId)) {
    return { items: recent, pinnedOutsideRecent: false };
  }

  const rest = recent.filter((r) => r.id !== selected.id);
  return { items: [selected, ...rest.slice(0, recentCount - 1)], pinnedOutsideRecent: true };
}

export { RECENT_SIDEBAR_COUNT };
