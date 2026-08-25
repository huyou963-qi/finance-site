import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function utcDate(value: string): Date | null {
  const m = value.trim().match(/^(\d{1,2})-([A-Z][a-z]{2})-(\d{4})$/);
  if (!m || MONTHS[m[2]] == null) return null;
  return new Date(Date.UTC(Number(m[3]), MONTHS[m[2]], Number(m[1])));
}

function numberValue(value: unknown): number | null {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

/** SPDR archive workbook: the issuer publishes a direct daily `Tonnes of Gold` column. */
export function parseSpdrGldArchive(buffer: Buffer): {
  points: ObservationPoint[];
  skippedInvalid: number;
} {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets["US GLD Historical Archive"];
  if (!sheet) throw new Error("GLD archive 缺少 US GLD Historical Archive 工作表");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  const header = rows[0]?.map(String) ?? [];
  const dateIndex = header.indexOf("Date");
  const tonnesIndex = header.indexOf("Tonnes of Gold");
  if (dateIndex < 0 || tonnesIndex < 0) throw new Error("GLD archive 缺少 Date/Tonnes of Gold 列");
  const points: ObservationPoint[] = [];
  let skippedInvalid = 0;
  for (const row of rows.slice(1)) {
    const obsDate = utcDate(String(row[dateIndex] ?? ""));
    const value = numberValue(row[tonnesIndex]);
    if (!obsDate || value == null || value < 0) {
      skippedInvalid += 1;
      continue;
    }
    points.push({ obsDate, value });
  }
  return { points, skippedInvalid };
}

/** IAU product page exposes the authoritative trade-date tonnes directly in component JSON. */
export function parseIauCurrentTonnes(html: string): ObservationPoint {
  const tonnes = html.match(/"tonnes":\{"visible":true,[\s\S]{0,500}?"formattedValue":"([\d,.]+)"[\s\S]{0,500}?"formattedAsOfDate":"([A-Z][a-z]{2} \d{1,2}, \d{4})"/);
  if (!tonnes) throw new Error("IAU 页面缺少 Tonnes in Trust 数据点");
  const value = numberValue(tonnes[1]);
  const dateMatch = tonnes[2].match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/);
  if (value == null || !dateMatch || MONTHS[dateMatch[1]] == null) {
    throw new Error("IAU Tonnes in Trust 日期或数值无效");
  }
  return {
    obsDate: new Date(Date.UTC(Number(dateMatch[3]), MONTHS[dateMatch[1]], Number(dateMatch[2]))),
    value,
  };
}

function excelDate(value: unknown): Date | null {
  const text = String(value ?? "").trim();
  const dmy = utcDate(text);
  if (dmy) return dmy;
  const mdy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!mdy) return null;
  const year = Number(mdy[3]) < 100 ? 2000 + Number(mdy[3]) : Number(mdy[3]);
  return new Date(Date.UTC(year, Number(mdy[1]) - 1, Number(mdy[2])));
}

/** Global X GOLD: exact official UOI × per-unit metal entitlement, converted to metric tonnes. */
export function parseGlobalXGoldHoldings(navBuffer: Buffer, entitlementBuffer: Buffer): {
  points: ObservationPoint[];
  skippedInvalid: number;
} {
  const navBook = XLSX.read(navBuffer, { type: "buffer" });
  const navSheet = navBook.Sheets.NAV;
  const entitlementBook = XLSX.read(entitlementBuffer, { type: "buffer" });
  const entitlementSheet = entitlementBook.Sheets.Sheet1;
  if (!navSheet || !entitlementSheet) throw new Error("Global X GOLD 工作簿缺少 NAV/Sheet1");
  const navRows = XLSX.utils.sheet_to_json<unknown[]>(navSheet, { header: 1, raw: false, defval: "" });
  const navHeader = navRows.findIndex((row) => row.map(String).includes("Valuation Date"));
  if (navHeader < 0) throw new Error("Global X NAV 缺少 Valuation Date 表头");
  const entRows = XLSX.utils.sheet_to_json<unknown[]>(entitlementSheet, { header: 1, raw: false, defval: "" });
  const entitlement = new Map<string, number>();
  for (const row of entRows) {
    const date = excelDate(row[1]);
    const ounces = numberValue(row[10]);
    if (date && ounces != null && ounces > 0) entitlement.set(date.toISOString().slice(0, 10), ounces);
  }
  const points: ObservationPoint[] = [];
  let skippedInvalid = 0;
  for (const row of navRows.slice(navHeader + 1)) {
    const obsDate = excelDate(row[0]);
    const uoi = numberValue(row[4]);
    const ouncesPerUnit = obsDate ? entitlement.get(obsDate.toISOString().slice(0, 10)) : undefined;
    if (!obsDate || uoi == null || uoi <= 0 || ouncesPerUnit == null) {
      skippedInvalid += 1;
      continue;
    }
    // PostgreSQL/Prisma Float round-trips can differ in the final binary digit;
    // fixed decimal precision keeps repeated official-file imports idempotent.
    const tonnes = (uoi * ouncesPerUnit) / 32_150.74656862798;
    points.push({ obsDate, value: Number(tonnes.toFixed(12)) });
  }
  if (!points.length) throw new Error("Global X GOLD 官方文件没有可联结的 UOI/Metal Entitlement 日期");
  return { points, skippedInvalid };
}

export type WisdomTreeBarListProduct = "gbs" | "sgbs";

/** Parse the custodian's first-page account summary; never sum individual bars. */
export function parseWisdomTreeBarListText(
  text: string,
  product: WisdomTreeBarListProduct,
): ObservationPoint {
  const normalized = text.replace(/\s*\|\s*/g, " ").replace(/\s+/g, " ").trim();
  let dateText: string | undefined;
  let ouncesText: string | undefined;
  if (product === "gbs") {
    if (!normalized.includes("LAW DEBENTURE TRUST RE GBS")) {
      throw new Error("GBS bar list 缺少独立发行人账户锚点");
    }
    const match = normalized.match(
      /Total Allocated Fine Weight: LAW DEBENTURE TRUST RE GBS (\d{1,2} [A-Z][a-z]+ \d{4}) \d+ [\d,.]+ ([\d,.]+)/,
    );
    dateText = match?.[1];
    ouncesText = match?.[2];
  } else {
    if (!normalized.includes("WisdomTree Physical Swiss Gold")) {
      throw new Error("SGBS bar list 缺少产品全名锚点");
    }
    const match = normalized.match(
      /Client Copy as at: (\d{1,2}-[A-Z][a-z]+-\d{4})[^]*?WisdomTree Physical Swiss Gold \d+ [\d,.]+ ([\d,.]+)/,
    );
    dateText = match?.[1]?.replace(/-/g, " ");
    ouncesText = match?.[2];
  }
  const dateMatch = dateText?.match(/^(\d{1,2}) ([A-Z][a-z]+) (\d{4})$/);
  const monthName = dateMatch?.[2]?.slice(0, 3);
  const ounces = numberValue(ouncesText);
  if (!dateMatch || !monthName || MONTHS[monthName] == null || ounces == null || ounces <= 0) {
    throw new Error(`${product.toUpperCase()} bar list 日期或 Total Fine Ounces 无效`);
  }
  return {
    obsDate: new Date(Date.UTC(Number(dateMatch[3]), MONTHS[monthName], Number(dateMatch[1]))),
    value: Number((ounces / 32_150.74656862798).toFixed(12)),
  };
}

export async function parseWisdomTreeBarListPdf(
  buffer: Buffer,
  product: WisdomTreeBarListProduct,
): Promise<ObservationPoint> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({ data: new Uint8Array(buffer) }).promise;
  try {
    const page = await document.getPage(1);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" | ");
    return parseWisdomTreeBarListText(text, product);
  } finally {
    await document.destroy();
  }
}

const PHAU_ISIN = "JE00B1VS3770";
const PHAU_TICKER = "phau ln equity";
const PHAU_NAME = "WisdomTree Physical Gold";

function excelSerialDate(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
}

/** WGC monthly individual-fund table: directly disclosed PHAU holdings in tonnes. */
export function parseWgcPhauMonthlyHoldings(buffer: Buffer): {
  points: ObservationPoint[];
  skippedInvalid: number;
} {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets["Holdings by month"];
  if (!sheet) throw new Error("WGC ETF 月表缺少 Holdings by month 工作表");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });
  const width = Math.max(...rows.slice(0, 6).map((row) => row.length), 0);
  const isinMatches: number[] = [];
  const identityMatches: number[] = [];
  for (let column = 0; column < width; column++) {
    const headers = rows.slice(0, 6).map((row) => String(row[column] ?? "").trim());
    if (headers.some((value) => value.toUpperCase() === PHAU_ISIN)) isinMatches.push(column);
    if (
      headers.some((value) => value.toLowerCase() === PHAU_TICKER) &&
      headers.some((value) => value === PHAU_NAME)
    ) {
      identityMatches.push(column);
    }
  }
  const candidates = isinMatches.length ? isinMatches : identityMatches;
  if (candidates.length !== 1) {
    throw new Error(`WGC PHAU 产品列必须唯一匹配，实际 ${candidates.length} 列`);
  }
  const productColumn = candidates[0];
  const points: ObservationPoint[] = [];
  let skippedInvalid = 0;
  for (const row of rows.slice(6)) {
    const obsDate = excelSerialDate(row[0]);
    const value = numberValue(row[productColumn]);
    if (!obsDate || value == null || value < 0) {
      if (row[0] || row[productColumn]) skippedInvalid += 1;
      continue;
    }
    points.push({ obsDate, value: Number(value.toFixed(12)) });
  }
  if (!points.length) throw new Error("WGC PHAU 月表没有有效吨数观测");
  return { points, skippedInvalid };
}
