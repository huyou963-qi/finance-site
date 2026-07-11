import { dateToUtcSec } from "@/lib/equity/sectorReturns";

/** 日末 UTC 秒（含当日） */
export function endOfUtcDaySec(date: string): number | null {
  const start = dateToUtcSec(date);
  if (start == null) return null;
  return start + 86400 - 1;
}

export function parseReturnRange(
  fromDate: string | null,
  toDate: string | null,
): { fromSec: number; toSec: number; from: string; to: string } | { error: string } {
  if (!fromDate || !toDate) {
    return { error: "from / to 须为 YYYY-MM-DD" };
  }
  const fromSec = dateToUtcSec(fromDate);
  const toSec = endOfUtcDaySec(toDate);
  if (fromSec == null || toSec == null) {
    return { error: "from / to 须为 YYYY-MM-DD" };
  }
  if (toSec < fromSec) {
    return { error: "截止日期须不早于开始日期" };
  }
  return { fromSec, toSec, from: fromDate, to: toDate };
}
