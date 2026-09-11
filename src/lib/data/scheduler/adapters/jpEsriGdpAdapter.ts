import type { FetchIncrementalResult } from "../types";
import { fetchEsriGdpBundle } from "../jpEsriGdp/client";
import { JP_ESRI_GDP_SERIES } from "../jpEsriGdp/catalog";
import { parseEsriGdpCsv } from "../jpEsriGdp/parser";

export async function fetchJpEsriGdpIncremental(_metadata: unknown, instrumentCode: string, _obsStart: string): Promise<FetchIncrementalResult> {
  const target = JP_ESRI_GDP_SERIES.find((s) => s.code === instrumentCode);
  if (!target) throw new Error(`Unknown ESRI GDP series: ${instrumentCode}`);
  const bundle = await fetchEsriGdpBundle();
  const parsed = parseEsriGdpCsv(bundle.texts[target.table], target.table);
  // ESRI explicitly revises every SA quarter back to 1994 on each release.
  // Unified writer skips unchanged values and atomically captures changed values as real-time vintages.
  return { points: parsed.series[instrumentCode], sourceLatestObsDate: parsed.latestObsDate, skippedInvalid: 0 };
}
