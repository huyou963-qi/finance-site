import { ECB_API_BASE, findEuropeCoreSeries } from "../europeCore/catalog";
import type { FetchIncrementalResult } from "../types";

export function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

export function parseEcbCsv(csv: string): FetchIncrementalResult {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { points: [], sourceLatestObsDate: null, skippedInvalid: 0 };
  const header = parseCsvLine(lines[0]!).map((value) => value.trim());
  const periodIndex = header.indexOf("TIME_PERIOD");
  const valueIndex = header.indexOf("OBS_VALUE");
  if (periodIndex < 0 || valueIndex < 0) throw new Error("ECB CSV 缺少 TIME_PERIOD/OBS_VALUE");
  const points: FetchIncrementalResult["points"] = [];
  let skippedInvalid = 0;
  for (const line of lines.slice(1)) {
    const row = parseCsvLine(line);
    const period = row[periodIndex]?.trim() ?? "";
    const raw = row[valueIndex]?.trim() ?? "";
    if (!raw) continue;
    const obsDate = /^\d{4}-\d{2}-\d{2}$/.test(period)
      ? new Date(`${period}T00:00:00Z`)
      : /^\d{4}-\d{2}$/.test(period)
        ? new Date(`${period}-01T00:00:00Z`)
        : null;
    const value = Number(raw);
    if (!obsDate || Number.isNaN(obsDate.getTime()) || !Number.isFinite(value)) {
      skippedInvalid += 1;
      continue;
    }
    points.push({ obsDate, value });
  }
  points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  return { points, sourceLatestObsDate: points.at(-1)?.obsDate ?? null, skippedInvalid };
}

export async function fetchEcbIncremental(
  instrumentCode: string,
  fetchStart: string,
): Promise<FetchIncrementalResult> {
  const series = findEuropeCoreSeries(instrumentCode);
  if (!series || series.provider !== "ecb" || !series.flow || !series.seriesKey) {
    throw new Error(`Unknown ECB instrument: ${instrumentCode}`);
  }
  const params = new URLSearchParams({ format: "csvdata", startPeriod: fetchStart });
  const url = `${ECB_API_BASE}/${series.flow}/${series.seriesKey}?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Accept: "text/csv", "User-Agent": "finance-site/1.0 ECB macro scheduler" },
  });
  if (!response.ok) throw new Error(`ECB HTTP ${response.status}: ${url}`);
  return parseEcbCsv(await response.text());
}
