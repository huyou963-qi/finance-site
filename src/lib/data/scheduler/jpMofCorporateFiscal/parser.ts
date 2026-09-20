import xlsx from "xlsx";
import type { ObservationPoint } from "../types";
import { list, record } from "../eStat/client";
import {
  JP_MOF_CORPORATE_TABLE,
  type JpMofCorporateFiscalSeries,
} from "./catalog";

function numeric(raw: unknown, label: string): number {
  const normalized = String(raw ?? "").normalize("NFKC").replace(/[ ,]/g, "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) throw new Error(`MOF ${label} invalid numeric value`);
  const value = Number(normalized);
  if (!Number.isFinite(value)) throw new Error(`MOF ${label} non-finite value`);
  return value;
}

function parseQuarterCode(raw: unknown): Date {
  const match = /^(\d{4})([1-4])$/.exec(String(raw));
  if (!match) throw new Error("MOF corporate quarter code changed");
  return new Date(Date.UTC(Number(match[1]), (Number(match[2]) - 1) * 3, 1));
}

export function parseJpMofCorporateResponse(
  json: unknown,
  series: Extract<JpMofCorporateFiscalSeries, { dataset: "corporate" }>,
): ObservationPoint[] {
  const root = record(record(json).GET_STATS_DATA);
  if (Number(record(root.RESULT).STATUS) !== 0) throw new Error("MOF corporate e-Stat request unsuccessful");
  const data = record(root.STATISTICAL_DATA);
  if (String(record(data.TABLE_INF)["@id"]) !== JP_MOF_CORPORATE_TABLE) {
    throw new Error("MOF corporate table identity changed");
  }
  const classes = list(record(data.CLASS_INF).CLASS_OBJ);
  const expected = new Map([["cat01", series.itemCode], ["cat02", "104"], ["cat03", "26"]]);
  for (const [dimension, code] of expected) {
    const object = classes.find((entry) => entry["@id"] === dimension);
    const values = list(object?.CLASS);
    if (values.length !== 1 || String(values[0]["@code"]) !== code) {
      throw new Error(`MOF corporate ${dimension} selection changed`);
    }
  }
  const item = list(classes.find((entry) => entry["@id"] === "cat01")?.CLASS)[0];
  if (String(item?.["@unit"]) !== series.sourceUnit) throw new Error("MOF corporate unit changed");
  const timeNames = new Map(list(classes.find((entry) => entry["@id"] === "time")?.CLASS).map(
    (entry) => [String(entry["@code"]), String(entry["@name"])],
  ));
  const points = list(record(data.DATA_INF).VALUE).map((row) => {
    for (const [dimension, code] of expected) {
      if (String(row[`@${dimension}`]) !== code) throw new Error(`MOF corporate mixed ${dimension}`);
    }
    if (String(row["@unit"]) !== series.sourceUnit) throw new Error("MOF corporate row unit changed");
    const timeCode = String(row["@time"]);
    const obsDate = parseQuarterCode(timeCode);
    const label = timeNames.get(timeCode)?.normalize("NFKC").replace(/\s/g, "") ?? "";
    const endMonth = obsDate.getUTCMonth() + 3;
    if (!label.includes(`${obsDate.getUTCFullYear()}年`) || !label.includes(`${endMonth}月`)) {
      throw new Error("MOF corporate time label/code mismatch");
    }
    return { obsDate, value: numeric(row.$, "corporate") };
  }).sort((a, b) => +a.obsDate - +b.obsDate);
  if (points.length < 280) throw new Error("MOF corporate history unexpectedly truncated");
  if (points[0].obsDate.toISOString().slice(0, 10) !== "1954-04-01") {
    throw new Error("MOF corporate history start changed");
  }
  for (let index = 1; index < points.length; index++) {
    const prior = points[index - 1].obsDate;
    if (+points[index].obsDate !== Date.UTC(prior.getUTCFullYear(), prior.getUTCMonth() + 3, 1)) {
      throw new Error("MOF corporate quarterly history has a gap");
    }
  }
  return points;
}

type SheetRows = unknown[][];
function rows(workbook: xlsx.WorkBook, name: string): SheetRows {
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(`MOF workbook sheet missing: ${name}`);
  return xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as SheetRows;
}

function eraYear(era: "昭和" | "平成" | "令和", year: number): number {
  return (era === "昭和" ? 1925 : era === "平成" ? 1988 : 2018) + year;
}

function findUniqueRow(table: SheetRows, label: string) {
  const matches = table.filter((row) => row.some((cell) => String(cell).replace(/\s/g, "") === label));
  if (matches.length !== 1) throw new Error(`MOF fiscal row changed: ${label}`);
  return matches[0];
}

/** Fiscal-year observations are dated April 1 of the named Japanese fiscal year. */
export function parseJpMofFiscalResultsWorkbook(buffer: Buffer) {
  const workbook = xlsx.read(buffer, { type: "buffer", raw: false });
  const table = rows(workbook, "昭和41-令和6");
  const header = table.find((row) => row.some((cell) => String(cell).includes("昭和41年度")));
  if (!header || !String(table.flat().find((cell) => String(cell).includes("単位：千円")) ?? "")) {
    throw new Error("MOF fiscal results header changed");
  }
  const selected = {
    revenue: findUniqueRow(table, "一般会計歳入決算総額"),
    expenditure: findUniqueRow(table, "一般会計歳出決算総額"),
    surplus: findUniqueRow(table, "財政法第41条の剰余金"),
  };
  const output: Record<"revenue" | "expenditure" | "surplus", ObservationPoint[]> = {
    revenue: [], expenditure: [], surplus: [],
  };
  let era: "昭和" | "平成" | "令和" = "昭和";
  let previousEraYear = 0;
  for (let column = 0; column < header.length; column++) {
    const raw = String(header[column]).normalize("NFKC").replace(/\s/g, "");
    if (!raw) continue;
    if (raw.includes("昭和")) era = "昭和";
    else if (raw.includes("平成")) era = "平成";
    else if (raw.includes("令和")) era = "令和";
    const yearMatch = /(元|\d+)(?:年度)?$/.exec(raw);
    if (!yearMatch) continue;
    const yearInEra = yearMatch[1] === "元" ? 1 : Number(yearMatch[1]);
    if (era === "昭和" && previousEraYear && yearInEra <= previousEraYear && !raw.includes("平成")) continue;
    previousEraYear = yearInEra;
    const year = eraYear(era, yearInEra);
    if (year < 1966) continue;
    const obsDate = new Date(Date.UTC(year, 3, 1));
    for (const field of Object.keys(output) as Array<keyof typeof output>) {
      output[field].push({ obsDate, value: numeric(selected[field][column], `fiscal ${field}`) / 1_000 });
    }
  }
  for (const field of Object.keys(output) as Array<keyof typeof output>) {
    if (output[field].length < 50) {
      throw new Error(`MOF fiscal ${field} history changed`);
    }
    for (let index = 1; index < output[field].length; index++) {
      const prior = output[field][index - 1]!.obsDate;
      if (+output[field][index]!.obsDate !== Date.UTC(prior.getUTCFullYear() + 1, 3, 1)) {
        throw new Error(`MOF fiscal ${field} history has a gap`);
      }
    }
  }
  return output;
}

function fiscalYearFromSheet(name: string): number | undefined {
  const match = /^(昭和|平成|令和)(元|\d+)$/.exec(name);
  if (!match) return undefined;
  return eraYear(match[1] as "昭和" | "平成" | "令和", match[2] === "元" ? 1 : Number(match[2]));
}

export function parseJpMofDebtServiceWorkbook(buffer: Buffer): ObservationPoint[] {
  const workbook = xlsx.read(buffer, { type: "buffer", raw: false });
  const points: ObservationPoint[] = [];
  for (const name of workbook.SheetNames) {
    const year = fiscalYearFromSheet(name);
    if (!year) continue;
    const table = rows(workbook, name);
    const header = table.find((row) => row.some((cell) => String(cell).replace(/\s/g, "") === "決算額"));
    if (!header) throw new Error(`MOF debt-service settlement header missing: ${name}`);
    const settlementColumn = header.findIndex((cell) => String(cell).replace(/\s/g, "") === "決算額");
    const row = findUniqueRow(table, "国債費");
    points.push({ obsDate: new Date(Date.UTC(year, 3, 1)), value: numeric(row[settlementColumn], "debt service") / 1_000 });
  }
  points.sort((a, b) => +a.obsDate - +b.obsDate);
  if (points.length < 50) {
    throw new Error("MOF debt-service history changed");
  }
  for (let index = 1; index < points.length; index++) {
    const prior = points[index - 1]!.obsDate;
    if (+points[index]!.obsDate !== Date.UTC(prior.getUTCFullYear() + 1, 3, 1)) {
      throw new Error("MOF debt-service history has a gap");
    }
  }
  return points;
}

export function parseJpMofDebtWorkbook(buffer: Buffer): ObservationPoint[] {
  const workbook = xlsx.read(buffer, { type: "buffer", raw: false });
  if (workbook.SheetNames.length !== 1) throw new Error("MOF central debt workbook sheets changed");
  const table = rows(workbook, workbook.SheetNames[0]);
  const header = table.find((row) => row.some((cell) => /2021 September/.test(String(cell))));
  if (!header || !table.flat().some((cell) => /Unit: 100 million yen/.test(String(cell)))) {
    throw new Error("MOF central debt header changed");
  }
  const debtRows = table.filter((row) => row.some((cell) => /General Bonds/.test(String(cell))));
  if (debtRows.length !== 1) throw new Error("MOF General Bonds row changed");
  const debtRow = debtRows[0];
  const points: ObservationPoint[] = [];
  for (let column = 0; column < header.length; column++) {
    const match = /(20\d{2})\s+(March|June|September|December)/.exec(String(header[column]));
    if (!match) continue;
    const month = { March: 2, June: 5, September: 8, December: 11 }[match[2] as "March" | "June" | "September" | "December"];
    points.push({ obsDate: new Date(Date.UTC(Number(match[1]), month, 1)), value: numeric(debtRow[column], "General Bonds") });
  }
  if (points.length < 20 || points[0]?.obsDate.toISOString().slice(0, 10) !== "2021-09-01") {
    throw new Error("MOF General Bonds history changed");
  }
  for (let index = 1; index < points.length; index++) {
    const prior = points[index - 1].obsDate;
    if (+points[index].obsDate !== Date.UTC(prior.getUTCFullYear(), prior.getUTCMonth() + 3, 1)) {
      throw new Error("MOF General Bonds quarterly history has a gap");
    }
  }
  return points;
}
