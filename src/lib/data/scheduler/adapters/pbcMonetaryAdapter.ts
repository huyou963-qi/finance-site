import type { FetchIncrementalResult } from "../types";
import { fetchPbcMonetarySeries } from "../pbcMonetary/client";

export async function fetchPbcMonetaryIncremental(metadata: unknown, _code: string, obsStart: string): Promise<FetchIncrementalResult> {
  const scrape = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).scrape as Record<string, unknown> | undefined : undefined;
  if (!scrape || typeof scrape.component !== "string") throw new Error("人民银行货币信贷序列缺少 scrape.component");
  const start = new Date(`${obsStart}T00:00:00.000Z`); const points = await fetchPbcMonetarySeries(scrape.component, start);
  return { points, sourceLatestObsDate: points.at(-1)?.obsDate ?? null, skippedInvalid: 0 };
}
