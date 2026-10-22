import type { FetchIncrementalResult, ObservationPoint } from "../types";

/** Official BTS dataset, not the zero-column catalogue/link views. */
export const BTS_TRANSPORT_URL = "https://data.bts.gov/resource/bw6n-ddqk.json";
export const BTS_TRANSPORT_FIELDS: Readonly<Record<string, string>> = {
  RAILFRTCARLOADSD11: "rail_frt_carloads_d11",
  RAILFRTINTERMODALD11: "rail_frt_intermodal_d11",
  TSIFRGHT: "tsi_freight",
  TRUCKD11: "truck_d11",
};

export function parseBtsTransport(payload: unknown, series: string): ObservationPoint[] {
  const field = BTS_TRANSPORT_FIELDS[series];
  if (!field || !Array.isArray(payload) || !payload.length) throw new Error("BTS missing dataset or unknown series");
  const points: ObservationPoint[] = [];
  const dates = new Set<string>();
  for (const row of payload) {
    if (!row || typeof row !== "object" || typeof row.obs_date !== "string"
      || !/^\d{4}-\d{2}-01T00:00:00(?:\.000)?$/.test(row.obs_date)) throw new Error("BTS invalid observation date");
    if (row[field] == null) continue; // Different series can have different latest periods.
    const raw = row[field];
    if (typeof raw !== "string" || !/^-?\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw))) throw new Error("BTS invalid numeric value");
    const obsDate = new Date(row.obs_date + "Z");
    const period = row.obs_date.slice(0, 19);
    if (!Number.isFinite(obsDate.getTime()) || obsDate.toISOString().slice(0, 19) !== period
      || dates.has(period)) throw new Error("BTS duplicate or invalid period");
    dates.add(period);
    points.push({ obsDate, value: Number(raw) });
  }
  if (!points.length) throw new Error("BTS series has no published observations");
  return points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
}

export async function fetchBtsTransportIncremental(series: string): Promise<FetchIncrementalResult> {
  // Full history is small (< 400 months) and captures official revisions.
  // One bounded request, no FRED fallback that could hide a stale mirror.
  const url = new URL(BTS_TRANSPORT_URL);
  url.searchParams.set("$select", "obs_date," + Object.values(BTS_TRANSPORT_FIELDS).join(","));
  url.searchParams.set("$order", "obs_date ASC");
  url.searchParams.set("$limit", "10000");
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`BTS dataset HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (!Array.isArray(payload) || payload.length >= 10000) throw new Error("BTS dataset truncated or malformed");
  const points = parseBtsTransport(payload, series);
  return { points, sourceLatestObsDate: points.at(-1)!.obsDate, skippedInvalid: 0,
    sourceMetadata: { sourceUrl: BTS_TRANSPORT_URL, field: BTS_TRANSPORT_FIELDS[series],
      seasonalAdjustment: "SA", acquisition: "official_bts_socrata", revisionPolicy: "full_history" } };
}
