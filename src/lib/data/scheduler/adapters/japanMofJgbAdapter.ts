import { JGB_SERIES } from "../japanMofJgb/catalog";
import { fetchJgbCurve } from "../japanMofJgb/client";
import type { FetchIncrementalResult } from "../types";

export async function fetchJapanMofJgbIncremental(code: string, observationStart: string): Promise<FetchIncrementalResult> {
  const row = JGB_SERIES.find((s) => s.code === code);
  if (!row) throw new Error(`Unknown JGB series ${code}`);
  const full = (await fetchJgbCurve()).get(row.years)!;
  if (!full.length) throw new Error(`JGB ${row.years}Y empty`);
  return { points: full.filter((p) => p.obsDate >= new Date(observationStart)), sourceLatestObsDate: full.at(-1)!.obsDate, skippedInvalid: 0 };
}
