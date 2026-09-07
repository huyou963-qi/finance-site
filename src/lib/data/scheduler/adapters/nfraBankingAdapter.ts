import type { FetchIncrementalResult } from "../types";
import {
  fetchNfraBankingWorkbooks,
  type NfraBankingDataset,
} from "../nfraBanking/client";
import { nfraBankingSeriesByProvider } from "../nfraBanking/catalog";
import { parseNfraBankingWorkbook } from "../nfraBanking/parseNfraBankingWorkbook";

function readScrapeConfig(metadata: unknown): {
  provider?: string;
  dataset?: NfraBankingDataset;
  fixturePaths?: string[];
} {
  if (!metadata || typeof metadata !== "object") return {};
  const scrape = (metadata as Record<string, unknown>).scrape;
  if (!scrape || typeof scrape !== "object") return {};
  const row = scrape as Record<string, unknown>;
  const dataset =
    row.dataset === "bank_assets_monthly" ||
    row.dataset === "commercial_bank_main_quarterly"
      ? row.dataset
      : undefined;
  return {
    provider: typeof row.provider === "string" ? row.provider : undefined,
    dataset,
    fixturePaths: Array.isArray(row.fixturePaths)
      ? row.fixturePaths.filter((item): item is string => typeof item === "string")
      : undefined,
  };
}

export async function fetchNfraBankingIncremental(
  metadata: unknown,
  _instrumentCode: string,
  obsStart: string,
): Promise<FetchIncrementalResult> {
  const { provider, dataset, fixturePaths } = readScrapeConfig(metadata);
  const config = nfraBankingSeriesByProvider(provider ?? "");
  if (!config || !dataset || config.dataset !== dataset) {
    throw new Error(
      `金融监管总局银行统计：未识别 provider/dataset=${provider ?? "无"}/${dataset ?? "无"}`,
    );
  }

  const currentYear = new Date().getUTCFullYear();
  const includeHistory = new Date(`${obsStart}T00:00:00.000Z`).getUTCFullYear() < currentYear;
  const sources = await fetchNfraBankingWorkbooks(dataset, {
    includeHistory,
    fixturePaths,
  });
  const all = [] as ReturnType<typeof parseNfraBankingWorkbook>[];
  for (const source of sources) all.push(parseNfraBankingWorkbook(source.workbook, dataset));

  const points = all
    .flatMap((parsed) => parsed.pointsBySeries.get(config.seriesKey) ?? [])
    .filter((point) => point.obsDate >= new Date(`${obsStart}T00:00:00.000Z`));
  const byDate = new Map(points.map((point) => [point.obsDate.getTime(), point]));
  const deduped = [...byDate.values()].sort(
    (a, b) => a.obsDate.getTime() - b.obsDate.getTime(),
  );
  return {
    points: deduped,
    sourceLatestObsDate: deduped.at(-1)?.obsDate ?? null,
    skippedInvalid: all.reduce((sum, parsed) => sum + parsed.skippedInvalid, 0),
  };
}

