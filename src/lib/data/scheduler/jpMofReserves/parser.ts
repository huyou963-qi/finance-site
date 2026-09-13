import type { ObservationPoint } from "../types";
import { JP_MOF_RESERVES_SERIES } from "./catalog";

const MONTH = /^(\d{1,2})月$/;
const ERA = /^(平成|令和)(元|\d+)年$/;

function eraYear(raw: string): number | undefined {
  const match = ERA.exec(raw.trim());
  if (!match) return undefined;
  const yearInEra = match[2] === "元" ? 1 : Number(match[2]);
  return (match[1] === "平成" ? 1988 : 2018) + yearInEra;
}

function parseValue(raw: string, label: string): number | undefined {
  const value = raw.trim();
  if (!value || value === "-") return undefined;
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) {
    throw new Error(`MOF reserves invalid value for ${label}: ${value}`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 5_000_000) {
    throw new Error(`MOF reserves implausible value for ${label}: ${value}`);
  }
  return parsed;
}

/** Parse the MOF Shift-JIS CSV after decoding. The selected columns are guarded
 * by English multi-row header anchors before fixed column positions are used.
 * MOF publishes end-of-month stocks; database dates are normalized to month start.
 * Blank values are allowed only before a component's first official publication.
 */
export function parseJpMofReservesCsv(text: string, now = new Date()) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (!lines.slice(0, 8).some((line) => line.startsWith("International Reserves/Foreign Currency Liquidity"))) {
    throw new Error("MOF reserves title changed");
  }
  if (!lines.slice(0, 8).some((line) => line.startsWith("（US$ millions)"))) {
    throw new Error("MOF reserves unit changed");
  }
  const officialHeader = lines.find((line) => line.includes("A. Official reserve assets") && line.includes("B. Other foreign currency assets"));
  const componentHeader = lines.find((line) => line.includes("(1) Foreign currency reserves") && line.includes("(2) IMF reserve position"));
  const subcomponentHeader = lines.find((line) => line.includes("(a) Securities") && line.includes("(b) Deposits with"));
  if (!officialHeader || !componentHeader || !subcomponentHeader) throw new Error("MOF reserves header anchors changed");
  const officialCells = officialHeader.split(",");
  const componentCells = componentHeader.split(",");
  const subcomponentCells = subcomponentHeader.split(",");
  if (
    officialCells[4]?.trim() !== "A. Official reserve assets" ||
    officialCells[22]?.trim() !== "B. Other foreign currency assets" ||
    componentCells[5]?.trim() !== "(1) Foreign currency reserves" ||
    componentCells[14]?.trim() !== "(2) IMF reserve position" ||
    componentCells[15]?.trim() !== "(3) SDRs" ||
    componentCells[16]?.trim() !== "(4) Gold" ||
    componentCells[18]?.trim() !== "(5) other reserve assets" ||
    subcomponentCells[6]?.trim() !== "(a) Securities" ||
    subcomponentCells[8]?.trim() !== "(b) Deposits with"
  ) {
    throw new Error("MOF reserves selected column layout changed");
  }

  const output: Record<string, ObservationPoint[]> = Object.fromEntries(
    JP_MOF_RESERVES_SERIES.map((series) => [series.instrumentCode, []]),
  );
  let currentYear: number | undefined;
  let previousDate = 0;
  let dataRows = 0;
  for (const line of lines) {
    const cells = line.split(",");
    const monthMatch = MONTH.exec(cells[1]?.trim() ?? "");
    if (!monthMatch) continue;
    const declaredGregorian = /^\d{4}$/.test(cells[2]?.trim() ?? "") ? Number(cells[2]) : undefined;
    const declaredEra = eraYear(cells[0] ?? "");
    if (declaredGregorian && declaredEra && declaredGregorian !== declaredEra) {
      throw new Error("MOF reserves Gregorian/Japanese year mismatch");
    }
    currentYear = declaredGregorian ?? declaredEra ?? currentYear;
    if (!currentYear) throw new Error("MOF reserves data begins without a year");
    const month = Number(monthMatch[1]);
    if (month < 1 || month > 12 || cells.length < 23) throw new Error("MOF reserves malformed data row");
    const obsDate = new Date(Date.UTC(currentYear, month - 1, 1));
    if (obsDate > now || obsDate.getTime() <= previousDate) throw new Error("MOF reserves date is future or nonascending");
    if (previousDate) {
      const previous = new Date(previousDate);
      const expected = Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 1);
      if (obsDate.getTime() !== expected) throw new Error("MOF reserves monthly history has a gap");
    }
    previousDate = obsDate.getTime();
    dataRows++;
    for (const series of JP_MOF_RESERVES_SERIES) {
      const value = parseValue(cells[series.column] ?? "", series.sourceName);
      const points = output[series.instrumentCode];
      if (value === undefined) {
        if (points.length) throw new Error(`MOF reserves gap after start: ${series.sourceName}`);
        continue;
      }
      points.push({ obsDate, value });
    }
  }
  if (dataRows < 300) throw new Error("MOF reserves history unexpectedly truncated");
  for (const series of JP_MOF_RESERVES_SERIES) {
    const points = output[series.instrumentCode];
    if (points[0]?.obsDate.toISOString().slice(0, 10) !== series.historyStart) {
      throw new Error(`MOF reserves history start changed: ${series.sourceName}`);
    }
    if (points.at(-1)?.obsDate.getTime() !== previousDate) {
      throw new Error(`MOF reserves latest month missing: ${series.sourceName}`);
    }
  }

  const latest = (key: string) => output[`mof_jp_reserves_${key}`].at(-1)!.value;
  const tolerance = 1;
  if (Math.abs(latest("foreign_currency") - latest("securities") - latest("deposits")) > tolerance) {
    throw new Error("MOF reserves latest foreign-currency subtotal identity failed");
  }
  if (
    Math.abs(
      latest("total") - latest("foreign_currency") - latest("imf_position") - latest("sdr") -
        latest("gold_value") - latest("other_reserve_assets"),
    ) > tolerance
  ) {
    throw new Error("MOF reserves latest official-assets subtotal identity failed");
  }
  return output;
}
