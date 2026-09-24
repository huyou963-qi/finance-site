import { readFile } from "node:fs/promises";
import type { FetchIncrementalResult } from "../types";
import { MANHEIM_MUVVI_CODE, MANHEIM_MUVVI_PROVIDER } from "../manheimMuvvi/catalog";
import { parseManheimMuvviWorkbook } from "../manheimMuvvi/parse";

export async function fetchManheimMuvviIncremental(metadata: unknown, instrumentCode: string): Promise<FetchIncrementalResult> {
  const scrape = (metadata as { scrape?: { provider?: string } } | null)?.scrape;
  if (instrumentCode !== MANHEIM_MUVVI_CODE || scrape?.provider !== MANHEIM_MUVVI_PROVIDER) {
    throw new Error(`Invalid Manheim MUVVI routing: ${instrumentCode}`);
  }
  const path = process.env.MANHEIM_MUVVI_FILE?.trim();
  if (!path) throw new Error("MANHEIM_MUVVI_FILE is not configured");
  const parsed = parseManheimMuvviWorkbook(await readFile(path));
  return { points: parsed.points, sourceLatestObsDate: parsed.points.at(-1)!.obsDate, skippedInvalid: 0 };
}
