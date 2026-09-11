import type { ObservationPoint } from "../types";
import { JGB_TENORS } from "./catalog";

/** MOF English CSV: percent units, named tenor columns, YYYY/M/D; '-' is unavailable.
 * Historical and current-month files are separate. Dates are business reference dates,
 * not publication dates (next business day 09:30 JST). Never fill missing tenors with 0.
 */
export function parseJgbCsv(text: string, now = new Date()): Map<number, ObservationPoint[]> {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (!lines[0]?.includes("Interest Rate") || !lines[0]?.includes("Unit : %")) throw new Error("JGB title/unit changed");
  const header = lines[1]?.split(",").map((s) => s.trim());
  if (!header || header[0] !== "Date" || JGB_TENORS.some((n) => header.filter((h) => h === `${n}Y`).length !== 1)) throw new Error("JGB tenor header changed");
  const result = new Map<number, ObservationPoint[]>(JGB_TENORS.map((n) => [n, []]));
  let previous = 0;
  for (const line of lines.slice(2)) {
    if (!line.trim() || /^,+$/.test(line) || /^"?\s*[^\d,].*clear the browser's cache/.test(line)) continue;
    const cells = line.split(",");
    const date = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(cells[0] ?? "");
    if (!date || cells.length !== header.length) throw new Error("JGB malformed data row");
    const [, yy, mm, dd] = date;
    const obsDate = new Date(Date.UTC(Number(yy), Number(mm) - 1, Number(dd)));
    if (obsDate.getUTCFullYear() !== Number(yy) || obsDate.getUTCMonth() !== Number(mm) - 1 || obsDate.getUTCDate() !== Number(dd) || obsDate.getTime() <= previous || obsDate > now || Number(yy) < 1974) throw new Error("JGB invalid/nonascending date");
    previous = obsDate.getTime();
    for (const tenor of JGB_TENORS) {
      const raw = cells[header.indexOf(`${tenor}Y`)]!.trim();
      if (raw === "-") continue;
      if (!/^-?\d+(\.\d+)?$/.test(raw)) throw new Error(`JGB invalid ${tenor}Y value`);
      const value = Number(raw);
      if (value < -10 || value > 100) throw new Error("JGB yield outside sanity bounds");
      result.get(tenor)!.push({ obsDate, value });
    }
  }
  if (!previous) throw new Error("JGB empty data");
  return result;
}
