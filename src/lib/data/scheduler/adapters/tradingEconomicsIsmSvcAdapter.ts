import type { ObservationPoint } from "../types";
import { loadTradingEconomicsIndicatorHtml } from "../tradingEconomicsIndicator/client";
import {
  parseTradingEconomicsIsmSvcPage,
  seriesPointForTeLabel,
} from "../tradingEconomicsIndicator/parseIsmSvcPage";
import { teLabelForIsmSvcInstrumentCode, TE_ISM_SVC_PAGE_URL } from "../tradingEconomicsIndicator/ismSvcCatalog";

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
      defaultUrl: TE_ISM_SVC_PAGE_URL,
    });
    cachedHtml = { html, at: now };
  }
  return parseTradingEconomicsIsmSvcPage(cachedHtml.html);
}

/** 从 TE ISM 服务业页抓取单条 ism_svc_us_svc_* 序列的最新观测 */
export async function fetchTradingEconomicsIsmSvcIncremental(
  metadata: unknown,
  instrumentCode: string,
  obsStart: string,
): Promise<{
  points: ObservationPoint[];
  skippedInvalid: number;
  sourceLatestObsDate: Date | null;
}> {
  const scrape = readScrapeProvider(metadata);
  if (scrape?.provider !== "tradingeconomics_ism_svc") {
    throw new Error(`非 TE ISM 服务业抓取配置：${instrumentCode}`);
  }

  const teLabel = teLabelForIsmSvcInstrumentCode(instrumentCode);
  if (!teLabel) {
    throw new Error(`未知 ISM 服务业仪器代码：${instrumentCode}`);
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

/** 一次抓取整页并返回全部 ISM 服务业序列点（供 sync-ism-svc-te 脚本使用） */
export async function fetchAllTradingEconomicsIsmSvcPoints(options?: {
  fixturePath?: string;
  url?: string;
}) {
  const html = await loadTradingEconomicsIndicatorHtml({
    fixturePath: options?.fixturePath,
    url: options?.url,
    defaultUrl: TE_ISM_SVC_PAGE_URL,
  });
  return parseTradingEconomicsIsmSvcPage(html);
}

export function clearTradingEconomicsIsmSvcHtmlCache(): void {
  cachedHtml = null;
}
