import type { ObservationPoint } from "../types";
import { loadTradingEconomicsIndicatorHtml } from "../tradingEconomicsIndicator/client";
import {
  EURO_COMPOSITE_PMI_INSTRUMENT_CODE,
  EURO_COMPOSITE_PMI_SCRAPE_PROVIDER,
  TE_EURO_COMPOSITE_PMI_PAGE_URL,
} from "../tradingEconomicsIndicator/euroCompositePmiCatalog";
import { parseTradingEconomicsEuroCompositePmiPage } from "../tradingEconomicsIndicator/parseEuroCompositePmiPage";

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
    const html = await loadTradingEconomicsIndicatorHtml({
      url: scrape?.url,
      defaultUrl: TE_EURO_COMPOSITE_PMI_PAGE_URL,
    });
    cachedHtml = { html, at: now };
  }
  return parseTradingEconomicsEuroCompositePmiPage(cachedHtml.html);
}

/** 从 TE 欧元区综合 PMI 页抓取最新观测 */
export async function fetchTradingEconomicsEuroCompositePmiIncremental(
  metadata: unknown,
  instrumentCode: string,
  obsStart: string,
): Promise<{
  points: ObservationPoint[];
  skippedInvalid: number;
  sourceLatestObsDate: Date | null;
}> {
  const scrape = readScrapeProvider(metadata);
  if (scrape?.provider !== EURO_COMPOSITE_PMI_SCRAPE_PROVIDER) {
    throw new Error(`非 TE 欧元区综合 PMI 抓取配置：${instrumentCode}`);
  }
  if (instrumentCode !== EURO_COMPOSITE_PMI_INSTRUMENT_CODE) {
    throw new Error(`未知欧元区综合 PMI 仪器代码：${instrumentCode}`);
  }

  const parsed = await getParsedPage(metadata);
  const { headline } = parsed;

  const start = new Date(`${obsStart}T00:00:00.000Z`);
  if (headline.obsDate < start) {
    return { points: [], skippedInvalid: 0, sourceLatestObsDate: headline.obsDate };
  }

  return {
    points: [{ obsDate: headline.obsDate, value: headline.value }],
    skippedInvalid: 0,
    sourceLatestObsDate: headline.obsDate,
  };
}

/** 一次抓取整页（供 sync-euro-composite-pmi-te 脚本使用） */
export async function fetchAllTradingEconomicsEuroCompositePmiPoints(options?: {
  fixturePath?: string;
  url?: string;
}) {
  const html = await loadTradingEconomicsIndicatorHtml({
    ...options,
    defaultUrl: TE_EURO_COMPOSITE_PMI_PAGE_URL,
  });
  return parseTradingEconomicsEuroCompositePmiPage(html);
}

export function clearTradingEconomicsEuroCompositePmiHtmlCache(): void {
  cachedHtml = null;
}
