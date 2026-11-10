import { INTL_LOCALE, type AppLocale } from "@/i18n/locales";

/**
 * 按界面语言格式化数字/日期（纯函数）。新代码与翻译后的页面用这里，
 * 不要再手写「亿/万」：中文 1.23亿、英文 123M 都由 Intl 的 compact 记数法给出。
 */

export function formatCompactNumber(
  value: number,
  locale: AppLocale,
  maximumFractionDigits = 2,
): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    notation: "compact",
    maximumFractionDigits,
  }).format(value);
}

export function formatNumber(
  value: number,
  locale: AppLocale,
  options: Intl.NumberFormatOptions = {},
): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(INTL_LOCALE[locale], options).format(value);
}

/** 只格式化日历日（YYYY-MM-DD 输入按 UTC 解释，避免时区把日期挪一天） */
export function formatCalendarDate(
  isoDate: string,
  locale: AppLocale,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" },
): string {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? `${isoDate}T00:00:00Z` : isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { ...options, timeZone: "UTC" }).format(d);
}
