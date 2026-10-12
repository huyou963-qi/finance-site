import type { FetchIncrementalResult } from "../types";
import { MANHEIM_MUVVI_CODE, MANHEIM_MUVVI_PROVIDER } from "../manheimMuvvi/catalog";
import { fetchOfficialManheimHistory } from "../manheimMuvvi/official";

export async function fetchManheimMuvviIncremental(metadata: unknown, instrumentCode: string, obsStart: string): Promise<FetchIncrementalResult> {
  const scrape = (metadata as { scrape?: { provider?: string } } | null)?.scrape;
  if (instrumentCode !== MANHEIM_MUVVI_CODE || scrape?.provider !== MANHEIM_MUVVI_PROVIDER) {
    throw new Error(`Invalid Manheim MUVVI routing: ${instrumentCode}`);
  }
  const { points } = await fetchOfficialManheimHistory();
  const start = new Date(`${obsStart}T00:00:00Z`);
  return { points: points.filter((point) => point.obsDate >= start), sourceLatestObsDate: points.at(-1)!.obsDate, skippedInvalid: 0 };
}
