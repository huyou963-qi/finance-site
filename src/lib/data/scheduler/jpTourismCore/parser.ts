import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";

const compact = (value: unknown) => String(value ?? "").replace(/\s+/g, "").trim();
const fullWidthDigits = (value: string) => value.replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xff10));

/** Find official result-summary PDFs, deliberately excluding prefecture tables and raw questionnaires. */
export function discoverInboundConsumptionResultPdfs(html: string, pageUrl: string): Array<{ url: string; label: string }> {
  const found = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ href: match[1], text: match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") }))
    .filter(({ href, text }) => /\.pdf(?:\?|$)/i.test(href) && /(?:1-3|4-6|7-9|10-12)月期[\s\S]*調査結果.*概要/.test(text))
    .map(({ href, text }) => ({ url: new URL(href, pageUrl).toString(), label: text }));
  const unique = [...new Map(found.map((entry) => [entry.url, entry])).values()];
  if (!unique.length) throw new Error("JTA inbound-consumption page has no official quarterly result PDFs");
  return unique;
}

/** The JTA summary PDF directly prints the total in trillion + hundred-million yen. */
export function parseInboundConsumptionSummaryText(text: string, linkLabel?: string): ObservationPoint {
  const normalized = fullWidthDigits(text).replace(/\s*\|\s*/g, " ").replace(/\s+/g, " ").trim();
  const period = normalized.match(/(?:(20\d{2})\s*年|令和\s*(元|\d+)\s*年)\s*(\d{1,2})\s*月?\s*[-－–～]\s*(\d{1,2})\s*月期/);
  const labelPeriod = linkLabel?.match(/(1-3|4-6|7-9|10-12)月期[\s\S]*?(20\d{2})年/);
  if (!period && !labelPeriod) throw new Error("JTA inbound-consumption PDF has no quarterly period anchor");
  const [startText, endText] = (period ? [period[3], period[4]] : labelPeriod![1].split("-"));
  const startMonth = Number(startText);
  const endMonth = Number(endText);
  const releaseYear = labelPeriod ? Number(labelPeriod[2]) : undefined;
  const labelYear = releaseYear ? releaseYear - (startMonth === 10 ? 1 : 0) : undefined;
  const textYear = period ? (period[1] ? Number(period[1]) : 2018 + (period![2] === "元" ? 1 : Number(period![2]))) : undefined;
  // Older PDFs repeat prior-period figures before their title.  A release-date
  // label gives the authoritative quarter when it is within one year of the
  // text match; retain a clearly different text year for archival page typos.
  const year = labelYear && textYear
    ? (labelYear < textYear - 1 ? textYear : labelYear)
    : textYear ?? labelYear!;
  if (![1, 4, 7, 10].includes(startMonth) || endMonth !== startMonth + 2) {
    throw new Error(`JTA inbound-consumption invalid quarter ${startMonth}-${endMonth}`);
  }
  const anchor = normalized.indexOf("訪日外国人旅行消費額");
  if (anchor < 0) throw new Error("JTA inbound-consumption PDF has no total-spending anchor");
  const window = normalized.slice(anchor, anchor + 5_000);
  const trillionAmount = window.match(/(\d+)\s*兆\s*([\d,]+)\s*億円/);
  // Pandemic quarters are below one trillion yen and the official summary
  // writes them as a plain `N億円`, rather than `0兆N億円`.
  const hundredMillionAmount = window.match(/([\d,]+)\s*億円/);
  const value = trillionAmount
    ? Number(trillionAmount[1]) * 10_000 + Number(trillionAmount[2].replace(/,/g, ""))
    : hundredMillionAmount
      ? Number(hundredMillionAmount[1].replace(/,/g, ""))
      : Number.NaN;
  if (!Number.isFinite(value)) throw new Error("JTA inbound-consumption PDF has no total spending amount near anchor");
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000) {
    throw new Error(`JTA inbound-consumption implausible total ${value}`);
  }
  return { obsDate: new Date(Date.UTC(year, startMonth - 1, 1)), value };
}

function parseYear(value: unknown): number | undefined {
  const text = compact(value);
  const gregorian = text.match(/令和(\d+)年/);
  if (gregorian) return 2018 + Number(gregorian[1]);
  const heisei = text.match(/平成(\d+)年/);
  if (heisei) return 1988 + Number(heisei[1]);
  const direct = text.match(/(20\d{2})年/);
  return direct ? Number(direct[1]) : undefined;
}

function numeric(value: unknown, context: string): number | undefined {
  if (value === "" || value == null) return undefined;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100_000_000) {
    throw new Error(`JTA accommodation invalid value at ${context}`);
  }
  return parsed;
}

/**
 * The rolling JTA workbook carries 2011-2025 on old3-2 and the current year
 * on 3-1. Values are the national row only; no prefecture cells are retained.
 */
export function parseForeignGuestNightsWorkbook(buffer: Buffer, now = new Date()): ObservationPoint[] {
  if (buffer.subarray(0, 2).toString() !== "PK") throw new Error("JTA accommodation response is not XLSX");
  const book = XLSX.read(buffer, { type: "buffer", cellFormula: false });
  const sheets = ["旧3-2", "3-1"];
  const points = new Map<string, ObservationPoint>();
  for (const sheetName of sheets) {
    const sheet = book.Sheets[sheetName];
    if (!sheet) throw new Error(`JTA accommodation workbook missing ${sheetName}`);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
    const national = rows.filter((row) => compact(row[0]) === "全国");
    if (national.length !== 1) throw new Error(`JTA accommodation ${sheetName} expected one national row`);
    const yearByColumn = new Map<number, number>();
    const monthByColumn = new Map<number, number>();
    let activeYear: number | undefined;
    for (let column = 1; column < national[0].length; column++) {
      let year: number | undefined;
      for (const row of rows.slice(0, 5)) year ??= parseYear(row[column]);
      // The government workbook uses merged year cells, so only the first
      // month of a 12-column group carries the year label.
      activeYear = year ?? activeYear;
      const monthMatch = compact(rows.slice(0, 5).map((row) => row[column]).find((value) => /^\d{1,2}月$/.test(compact(value)))).match(/^(\d{1,2})月$/);
      if (activeYear) yearByColumn.set(column, activeYear);
      if (monthMatch) monthByColumn.set(column, Number(monthMatch[1]));
    }
    for (const [column, year] of yearByColumn) {
      const month = monthByColumn.get(column);
      if (!month || month > 12) continue;
      const value = numeric(national[0][column], `${sheetName}/${year}-${month}`);
      if (value === undefined) continue;
      const obsDate = new Date(Date.UTC(year, month - 1, 1));
      if (obsDate > now) throw new Error(`JTA accommodation future observation ${obsDate.toISOString()}`);
      points.set(obsDate.toISOString().slice(0, 10), { obsDate, value });
    }
  }
  const output = [...points.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  if (output.length < 175 || output[0]?.obsDate.toISOString().slice(0, 10) !== "2011-01-01") {
    throw new Error("JTA accommodation history coverage changed");
  }
  for (let index = 1; index < output.length; index++) {
    const previous = output[index - 1].obsDate;
    const expected = Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 1);
    if (output[index].obsDate.getTime() !== expected) throw new Error("JTA accommodation monthly history has a gap");
  }
  return output;
}
