/** Pure date/index parsing shared by the daily SEC adapter and offline verification. */
export const DAILY_DISCLOSURE_FORMS = new Set(["8-K", "8-K/A", "10-Q", "10-Q/A", "10-K", "10-K/A"]);

export function disclosureDays(now = new Date(), days = 7, through?: string): string[] {
  if (!Number.isInteger(days) || days < 1 || days > 31) throw new Error("days 必须为 1–31");
  const eastern = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const end = new Date(`${through ?? eastern}T00:00:00Z`);
  if (!Number.isFinite(end.getTime()) || (through && end.toISOString().slice(0, 10) !== through)) {
    throw new Error("through 必须为有效的 YYYY-MM-DD");
  }
  if (!through) end.setUTCDate(end.getUTCDate() - 1);
  if (end.toISOString().slice(0, 10) >= eastern) throw new Error("只能同步已结束的美东日期");
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - days + i + 1);
    return date.toISOString().slice(0, 10);
  });
}

export type SecDailyIndexEntry = { cik: string; accession: string; form: string; filedAt: string };
export function parseSecDailyIndex(text: string): SecDailyIndexEntry[] {
  if (!/CIK\|Company Name\|Form Type\|Date Filed\|File\s*Name/i.test(text)) throw new Error("SEC 日索引格式异常");
  const entries: SecDailyIndexEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [cik, , form, rawDate, filename] = line.split("|");
    if (!DAILY_DISCLOSURE_FORMS.has(form)) continue;
    const filedAt = /^\d{8}$/.test(rawDate) ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : rawDate;
    const accession = filename?.match(/\/(\d{10}-\d{2}-\d{6})\.txt$/)?.[1];
    if (!/^\d{1,10}$/.test(cik) || !/^\d{4}-\d{2}-\d{2}$/.test(filedAt) || !accession) {
      throw new Error("SEC 日索引公告行异常");
    }
    entries.push({ cik: cik.padStart(10, "0"), form, filedAt, accession });
  }
  return entries;
}

export function financialVersionReady(accession: string, vintages: readonly {
  accession: string; revenue: number | null; eps: number | null; fiscalDate?: string;
}[], reportDate?: string | null): boolean {
  return vintages.some(row => row.accession === accession && (!reportDate || row.fiscalDate === reportDate) &&
    (row.revenue != null || row.eps != null));
}
