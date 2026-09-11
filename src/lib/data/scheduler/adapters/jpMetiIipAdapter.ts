import type { FetchIncrementalResult } from "../types";
import { JP_METI_IIP_PROVIDER, JP_METI_IIP_SERIES } from "../jpMetiIip/catalog";
import { fetchJpMetiIipWorkbook } from "../jpMetiIip/client";
import { parseJpMetiIipWorkbook } from "../jpMetiIip/parser";

export async function fetchJpMetiIipIncremental(metadata: unknown, instrumentCode: string, _obsStart: string): Promise<FetchIncrementalResult> {
  const md = metadata as { scrape?: { provider?: string; fixturePath?: string } } | null;
  if (md?.scrape?.provider !== JP_METI_IIP_PROVIDER || !JP_METI_IIP_SERIES.some((s) => s.instrumentCode === instrumentCode)) throw new Error(`METI IIP invalid routing: ${instrumentCode}`);
  const parsed = parseJpMetiIipWorkbook(await fetchJpMetiIipWorkbook(md.scrape.fixturePath));
  // Deliberately reread all 2018+ history: annual seasonal revisions affect old
  // observations; canonical writer skips unchanged values and captures revisions.
  const points = parsed[instrumentCode].points;
  return { points, sourceLatestObsDate: points.at(-1)!.obsDate, skippedInvalid: 0 };
}
