import { MARKET_INTERNALS_SERIES } from "../marketInternals/catalog";
import { loadDailyBreadth, loadDailyStyles } from "../marketInternals/client";
import type { FetchIncrementalResult } from "../types";

export async function fetchMarketInternalsIncremental(_metadata: unknown, code: string, from: string): Promise<FetchIncrementalResult> {
  const config = MARKET_INTERNALS_SERIES.find((row) => row.code === code);
  if (!config) throw new Error(`未知广度/风格序列: ${code}`);
  const dataset = config.source === "breadth" ? await loadDailyBreadth(from) : null;
  const rows = dataset?.rows ?? await loadDailyStyles();
  const available = rows.filter((row) => row.values[config.key] != null);
  const points = available.filter((row) => row.date >= from).map((row) => ({ obsDate: new Date(`${row.date}T00:00:00Z`), value: row.values[config.key]! }));
  return {
    points, sourceLatestObsDate: available.length ? new Date(`${available[available.length - 1].date}T00:00:00Z`) : null, skippedInvalid: 0,
    sourceMetadata: dataset ? { membershipAnchor: dataset.anchor, membershipSource: dataset.source, calendarThrough: dataset.calendarThrough, membershipCorroborated: dataset.membershipCorroborated, reconstructed: true, minimumCoverage: 0.95 } : { frequency: "daily", publisher: "Kenneth R. French", releaseCadence: "monthly", historicalVersionsMayBeRevised: true },
  };
}
