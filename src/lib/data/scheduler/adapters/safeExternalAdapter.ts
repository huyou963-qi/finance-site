import type { FetchIncrementalResult } from "../types";
import { fetchSafeExternalHistory } from "../safeExternal/client";
export async function fetchSafeExternalIncremental(metadata: unknown, code: string, obsStart: string): Promise<FetchIncrementalResult> { const series = (await fetchSafeExternalHistory()).get(code); const start = new Date(`${obsStart}T00:00:00.000Z`); const points = (series?.points ?? []).filter((point) => point.obsDate >= start); return { points, sourceLatestObsDate: series?.points.at(-1)?.obsDate ?? null, skippedInvalid: 0 }; }
