import { splitCsvLine } from "../adapters/bisCsv";
import type { ObservationPoint } from "../types";
import { JP_ESRI_GDP_SERIES, type EsriTable } from "./catalog";

/** ESRI C3 template: Shift-JIS CSV, English header row + subheader, year on Q1 only.
 * Dates are calendar quarter START. SA levels are already annualised billion yen.
 * Contributions: GDP column is QoQ %, other columns percentage points; imports already reverse signed.
 * Every release revises full SA history; never limit to the last observation window.
 */
export function parseEsriGdpCsv(text: string, table: EsriTable, now = new Date()) {
  const rows = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim()).map(splitCsvLine);
  const title = rows[1]?.[0] ?? "";
  const titles = { "gaku-mk": "Nominal, Seasonally Adjusted Series", "gaku-jk": "Real, Seasonally Adjusted Series", "def-qk": "Deflators, Seasonally Adjusted Series", "kiyo-jk": "Real, Seasonally Adjusted Series (Contributions to Quarter-to-Quarter Percent Change in GDP)" };
  if (title !== titles[table]) throw new Error(`ESRI ${table}: unexpected series title`);
  if ((table === "gaku-jk" || table === "def-qk") && !rows.slice(0, 2).flat().some((v) => v.includes("2020"))) throw new Error("ESRI base-year changed; review catalog before ingest");
  if (table.startsWith("gaku") && !text.includes("年率で表示") ) throw new Error("ESRI missing annualised-level footnote");
  const headerIndex = rows.findIndex((r) => r.includes("GDP(Expenditure Approach)"));
  if (headerIndex < 0) throw new Error("ESRI missing English GDP header");
  const header = rows[headerIndex].map((v, i) => ["Net Exports", "Exports", "Imports"].includes(rows[headerIndex + 1]?.[i]) ? rows[headerIndex + 1][i] : v);
  const targets = JP_ESRI_GDP_SERIES.filter((s) => s.table === table);
  const indices = targets.map((s) => {
    const matches = header.flatMap((v, i) => v === s.header ? [i] : []);
    if (matches.length !== 1) throw new Error(`ESRI missing/ambiguous column ${s.header}`);
    return matches[0];
  });
  const series = Object.fromEntries(targets.map((s) => [s.code, [] as ObservationPoint[]]));
  let year: number | undefined;
  let previous = -1;
  let latestObsDate: Date | null = null;
  for (const row of rows.slice(headerIndex + 2)) {
    const period = row[0].trim();
    if (!period || period.startsWith("＊")) continue;
    const match = /^(?:(\d{4})\/\s*)?(1|4|7|10)-\s*(3|6|9|12)\.$/.exec(period);
    if (!match) throw new Error(`ESRI invalid quarter label: ${period}`);
    if (match[1]) year = Number(match[1]);
    const month = Number(match[2]);
    if (!year || Number(match[3]) !== month + 2 || year < 1994 || (match[1] && month !== 1)) throw new Error(`ESRI invalid year/quarter ${period}`);
    const index = year * 4 + (month - 1) / 3;
    if ((previous >= 0 && index !== previous + 1) || (previous < 0 && index !== 1994 * 4)) throw new Error("ESRI non-contiguous/full-history dates");
    previous = index;
    const obsDate = new Date(Date.UTC(year, month - 1, 1));
    if (new Date(Date.UTC(year, month + 2, 1)) > now) throw new Error("ESRI future/incomplete reference quarter");
    targets.forEach((s, i) => {
      const raw = row[indices[i]]?.trim();
      // The first contribution period has no preceding quarter. Only this blank is legitimate.
      if (table === "kiyo-jk" && index === 1994 * 4 && raw === "") return;
      if (!raw || !/^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(raw)) throw new Error(`ESRI invalid value ${s.code}/${period}: ${raw}`);
      const value = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(value) || (table === "def-qk" && (value <= 0 || value > 1000))) throw new Error(`ESRI invalid range ${s.code}`);
      series[s.code].push({ obsDate, value });
    });
    latestObsDate = obsDate;
  }
  if (targets.some((s) => series[s.code].length < 100)) throw new Error("ESRI truncated/empty history");
  return { series, latestObsDate, skippedInvalid: 0 };
}
