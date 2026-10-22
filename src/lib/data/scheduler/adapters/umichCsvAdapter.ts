import type { FetchIncrementalResult, ObservationPoint } from "../types";

export const UMICH_CURRENT_CSV = "https://www.sca.isr.umich.edu/files/tbcics.csv";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Current official table contains prior finals plus the current preliminary.
 * Blank/header rows are allowed; malformed data rows fail closed. */
export function parseUmichCsv(text: string) {
  const points: ObservationPoint[] = [];
  const preliminaryPeriods: string[] = [];
  const seen = new Set<string>();
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const cols = line.split(",").map(value => value.trim());
    const month = MONTHS.indexOf(cols[0].replace(/\s*\(P\)$/i, ""));
    if (month < 0) {
      if (/^\d{4}$/.test(cols[1] ?? "")) throw new Error("Michigan unrecognized month");
      continue;
    }
    if (!/^\d{4}$/.test(cols[1]) || !/^\d+(?:\.\d+)?$/.test(cols[4] ?? "")) throw new Error("Michigan CSV schema changed");
    const obsDate = new Date(Date.UTC(Number(cols[1]), month, 1));
    const period = obsDate.toISOString().slice(0, 10);
    const value = Number(cols[4]);
    if (!Number.isFinite(value) || seen.has(period)) throw new Error("Michigan invalid or duplicate observation");
    seen.add(period);
    points.push({ obsDate, value });
    if (/\(P\)$/i.test(cols[0])) preliminaryPeriods.push(period);
  }
  if (!points.length) throw new Error("Michigan CSV has no observations");
  points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  return { points, preliminaryPeriods };
}

export async function fetchUmichCsvIncremental(): Promise<FetchIncrementalResult> {
  const res = await fetch(UMICH_CURRENT_CSV, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Michigan CSV HTTP ${res.status}`);
  const { points, preliminaryPeriods } = parseUmichCsv(await res.text());
  return { points, sourceLatestObsDate: points.at(-1)!.obsDate, skippedInvalid: 0,
    sourceMetadata: { sourceUrl: UMICH_CURRENT_CSV, preliminaryPeriods,
      attribution: "Surveys of Consumers, Survey Research Center, University of Michigan",
      authorization: "Owner confirmed authorization on 2026-10-22; no credentials stored", revisionPolicy: "retain worker vintages" } };
}
