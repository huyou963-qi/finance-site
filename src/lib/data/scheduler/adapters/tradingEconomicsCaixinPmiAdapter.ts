import type { ObservationPoint } from "../types";
import { loadTradingEconomicsIndicatorHtml } from "../tradingEconomicsIndicator/client";
import {
  CAIXIN_PMI_INSTRUMENT_CODE,
  CAIXIN_PMI_SCRAPE_PROVIDER,
  TE_CAIXIN_PMI_PAGE_URL,
} from "../tradingEconomicsIndicator/caixinPmiCatalog";
import { parseTradingEconomicsCaixinPmiPage } from "../tradingEconomicsIndicator/parseCaixinPmiPage";

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
      defaultUrl: TE_CAIXIN_PMI_PAGE_URL,
    });
    cachedHtml = { html, at: now };
  }
  return parseTradingEconomicsCaixinPmiPage(cachedHtml.html);
}

/** 从 TE 中国制造业 PMI（民间口径）页抓取最新观测 */
export async function fetchTradingEconomicsCaixinPmiIncremental(
  metadata: unknown,
  instrumentCode: string,
  obsStart: string,
): Promise<{
  points: ObservationPoint[];
  skippedInvalid: number;
  sourceLatestObsDate: Date | null;
}> {
  const scrape = readScrapeProvider(metadata);
  if (scrape?.provider !== CAIXIN_PMI_SCRAPE_PROVIDER) {
    throw new Error(`非 TE Caixin/RatingDog PMI 抓取配置：${instrumentCode}`);
  }
  if (instrumentCode !== CAIXIN_PMI_INSTRUMENT_CODE) {
    throw new Error(`未知中国制造业 PMI（民间口径）仪器代码：${instrumentCode}`);
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

/** 一次抓取整页（供 sync-caixin-pmi-te 脚本使用） */
export async function fetchAllTradingEconomicsCaixinPmiPoints(options?: {
  fixturePath?: string;
  url?: string;
}) {
  const html = await loadTradingEconomicsIndicatorHtml({
    ...options,
    defaultUrl: TE_CAIXIN_PMI_PAGE_URL,
  });
  return parseTradingEconomicsCaixinPmiPage(html);
}

export function clearTradingEconomicsCaixinPmiHtmlCache(): void {
  cachedHtml = null;
}
