import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";

export type ManheimFile = { points: ObservationPoint[]; publishedAt: string; latestMonth: string };

/** Parse a licensed Wind export. The workbook's declared XML dimension can be A1 even
 * when it contains hundreds of rows, so use SheetJS cells rather than read-only row iteration. */
export function parseManheimMuvviWorkbook(buffer: Buffer): ManheimFile {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!];
  if (!sheet) throw new Error("Manheim workbook has no worksheet");
  const english = String(sheet.B3?.v ?? "");
  if (!/Manheim Wholesale Value Index: Used Vehicle: SA/i.test(english)) {
    throw new Error(`Unexpected Manheim series title: ${english}`);
  }
  const publishedAt = String(sheet.B5?.v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) throw new Error("Manheim file missing publication date");
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  const byMonth = new Map<string, number>();
  for (let row = 5; row <= range.e.r; row++) {
    const date = sheet[`A${row + 1}`];
    const value = sheet[`B${row + 1}`];
    if (!date || !value) continue;
    const month = String(date.w ?? "").trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) continue;
    if (value.t !== "n" || typeof value.v !== "number" || !Number.isFinite(value.v) || value.v <= 0 || value.v > 1000) {
      throw new Error(`Invalid Manheim index value for ${month}`);
    }
    if (byMonth.has(month)) throw new Error(`Duplicate Manheim month ${month}`);
    byMonth.set(month, value.v);
  }
  const months = [...byMonth.keys()].sort();
  if (months.length < 300 || months[0] !== "1997-01" || Math.abs((byMonth.get("1997-01") ?? 0) - 100) > 0.000001) {
    throw new Error("Manheim file history or Jan 1997=100 base changed");
  }
  for (let i = 1; i < months.length; i++) {
    const prior = new Date(`${months[i - 1]}-01T00:00:00Z`);
    prior.setUTCMonth(prior.getUTCMonth() + 1);
    if (months[i] !== prior.toISOString().slice(0, 7)) throw new Error(`Manheim monthly gap after ${months[i - 1]}`);
  }
  const latestMonth = months.at(-1)!;
  if (publishedAt.slice(0, 7) <= latestMonth) throw new Error("Manheim publication date does not follow latest observation month");
  return {
    points: months.map((month) => ({ obsDate: new Date(`${month}-01T00:00:00Z`), value: byMonth.get(month)! })),
    publishedAt,
    latestMonth,
  };
}
