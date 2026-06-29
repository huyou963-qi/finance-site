import type { ObservationPoint } from "../types";
import { loadTradingEconomicsIsmHtml } from "../tradingEconomicsIndicator/client";
import {
  parseTradingEconomicsIsmPage,
  seriesPointForTeLabel,
} from "../tradingEconomicsIndicator/parseIsmPage";
import { teLabelForInstrumentCode } from "../tradingEconomicsIndicator/ismCatalog";

type ScrapeMeta = {
  provider?: string;
  url?: string;
};

let cachedHtml: { html: string; at: number } | null = null;
const CACHE_MS = 60_000;

function readScrapeProvider(metadata: unknown): ScrapeMeta | null {
  if (!metadata || typeof metadata !== "object") return null;
  const scrape = (metadata as Record<string, unknown>).scrape;
  if (!scrape || typeof scrape !== "object") return null;
  const s = scrape as Record<string, unknown>;
  return {
    provider: typeof s.provider === "string" ? s.provider : undefined,
    url: typeof s.url === "string" ? s.url : undefined,
  };
}

async function getParsedPage(metadata: unknown) {
  const scrape = readScrapeProvider(metadata);
  const now = Date.now();
  if (!cachedHtml || now - cachedHtml.at > CACHE_MS) {
    const html = await loadTradingEconomicsIsmHtml({ url: scrape?.url });
    cachedHtml = { html, at: now };
  }
  return parseTradingEconomicsIsmPage(cachedHtml.html);
}

/** 从 TE ISM 页抓取单条 ism_us_ism_* 序列的最新观测 */
export async function fetchTradingEconomicsIsmIncremental(
  metadata: unknown,
  instrumentCode: string,
  obsStart: string,
): Promise<{
  points: ObservationPoint[];
  skippedInvalid: number;
  sourceLatestObsDate: Date | null;
}> {
  const scrape = readScrapeProvider(metadata);
  if (scrape?.provider !== "tradingeconomics_ism") {
    throw new Error(`非 TE ISM 抓取配置：${instrumentCode}`);
  }

  const teLabel = teLabelForInstrumentCode(instrumentCode);
  if (!teLabel) {
    throw new Error(`未知 ISM 仪器代码：${instrumentCode}`);
  }

  const parsed = await getParsedPage(metadata);
  const series = seriesPointForTeLabel(parsed, teLabel);
  if (!series) {
    return { points: [], skippedInvalid: 0, sourceLatestObsDate: null };
  }

  const start = new Date(`${obsStart}T00:00:00.000Z`);
  if (series.obsDate < start) {
    return {
      points: [],
      skippedInvalid: 0,
      sourceLatestObsDate: series.obsDate,
    };
  }

  return {
    points: [{ obsDate: series.obsDate, value: series.value }],
    skippedInvalid: 0,
    sourceLatestObsDate: series.obsDate,
  };
}

/** 一次抓取整页并返回全部 ISM 序列点（供 sync-ism-te 脚本使用） */
export async function fetchAllTradingEconomicsIsmPoints(options?: {
  fixturePath?: string;
  url?: string;
}) {
  const html = await loadTradingEconomicsIsmHtml(options);
  return parseTradingEconomicsIsmPage(html);
}

export function clearTradingEconomicsIsmHtmlCache(): void {
  cachedHtml = null;
}
