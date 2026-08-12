import type { FetchIncrementalResult } from "../types";
import { fetchSafeExternalHistory } from "../safeExternal/client";
import type { SafeDataset } from "../safeExternal/catalog";

const SAFE_DATASET_KEYS = new Set<SafeDataset>(["reserve", "settlement", "payments", "bop", "iip", "debt"]);

export async function fetchSafeExternalIncremental(metadata: unknown, code: string, obsStart: string): Promise<FetchIncrementalResult> {
  const scrape = (metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).scrape : null) as Record<string, unknown> | null;
  const rawDataset = typeof scrape?.dataset === "string" ? scrape.dataset : null;
  const dataset = rawDataset && SAFE_DATASET_KEYS.has(rawDataset as SafeDataset) ? rawDataset as SafeDataset : null;
  const series = (await fetchSafeExternalHistory(dataset ? { datasets: [dataset] } : undefined)).get(code);
  const start = new Date(`${obsStart}T00:00:00.000Z`);
  const points = (series?.points ?? []).filter((point) => point.obsDate >= start);
  return { points, sourceLatestObsDate: series?.points.at(-1)?.obsDate ?? null, skippedInvalid: 0 };
}
