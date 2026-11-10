import assert from "node:assert/strict";
import test from "node:test";
import { formatCalendarDate, formatCompactNumber, formatNumber } from "@/lib/i18n/format";

test("compact：中文用万/亿，英文用 K/M/B", () => {
  assert.equal(formatCompactNumber(123_000_000, "zh"), "1.23亿");
  assert.equal(formatCompactNumber(45_600, "zh"), "4.56万");
  assert.equal(formatCompactNumber(123_000_000, "en"), "123M");
  assert.equal(formatCompactNumber(4_560_000_000, "en"), "4.56B");
  assert.equal(formatCompactNumber(Number.NaN, "en"), "—");
});

test("普通数字与日历日", () => {
  assert.equal(formatNumber(1234.5, "en", { maximumFractionDigits: 1 }), "1,234.5");
  assert.equal(formatCalendarDate("2026-01-05", "en"), "Jan 5, 2026");
  assert.equal(formatCalendarDate("2026-01-05", "zh"), "2026年1月5日");
  assert.equal(formatCalendarDate("not-a-date", "en"), "not-a-date");
});
