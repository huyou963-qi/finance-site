import type { FetchIncrementalResult, ObservationPoint } from "../types";
import {
  fetchOfficialFile,
  fetchOfficialHtml,
  discoverGlobalXGoldFiles,
  GLOBAL_X_GOLD_NAV_URL,
  GLOBAL_X_METAL_ENTITLEMENT_URL,
  ISHARES_IAU_PAGE_URL,
  SPDR_GLD_ARCHIVE_URL,
  WISDOMTREE_GBS_BARLIST_URL,
  WISDOMTREE_SGBS_BARLIST_URL,
  WGC_GOLD_ETF_PAGE_URL,
  fetchWgcGoldEtfWorkbook,
} from "../goldEtfHoldings/client";
import {
  parseGlobalXGoldHoldings,
  parseIauCurrentTonnes,
  parseSpdrGldArchive,
  parseWgcMonthlyHoldingsByTicker,
  parseWgcPhauMonthlyHoldings,
  parseWisdomTreeBarListPdf,
} from "../goldEtfHoldings/parse";

/**
 * IAU/GBS/SGBS 的官方页面只暴露当日快照、无历史可查；若某次调度错过（如
 * worker 队列拥堵），那一天就永久缺失。用同一份已授权的 WGC 月度工作簿
 * （本就为 PHAU 拉取）按 ticker 取月度直接吨数做缺口回填与长期兜底，失败
 * 不影响当日快照写入——这只是补充，不是主源。
 */
async function fetchWgcMonthlyBackfill(ticker: string, start: Date): Promise<ObservationPoint[]> {
  try {
    const buffer = await fetchWgcGoldEtfWorkbook();
    const parsed = parseWgcMonthlyHoldingsByTicker(buffer, ticker);
    return parsed.points.filter((point) => point.obsDate >= start);
  } catch {
    return [];
  }
}

/** 按 obsDate 去重，靠后的覆盖靠前的——用于让当日快照优先于月度回填。 */
function dedupeByDate(points: ObservationPoint[]): ObservationPoint[] {
  const byDate = new Map<string, ObservationPoint>();
  for (const point of points) byDate.set(point.obsDate.toISOString().slice(0, 10), point);
  return [...byDate.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
}

function config(metadata: unknown): { product?: string; url?: string; entitlementUrl?: string; fixturePath?: string; entitlementFixturePath?: string; sourceStartDate?: string } {
  if (!metadata || typeof metadata !== "object") return {};
  const scrape = (metadata as Record<string, unknown>).scrape;
  if (!scrape || typeof scrape !== "object") return {};
  const row = scrape as Record<string, unknown>;
  return {
    product: typeof row.product === "string" ? row.product : undefined,
    url: typeof row.url === "string" ? row.url : undefined,
    entitlementUrl: typeof row.entitlementUrl === "string" ? row.entitlementUrl : undefined,
    fixturePath: typeof row.fixturePath === "string" ? row.fixturePath : undefined,
    entitlementFixturePath: typeof row.entitlementFixturePath === "string" ? row.entitlementFixturePath : undefined,
    sourceStartDate: typeof row.sourceStartDate === "string" ? row.sourceStartDate : undefined,
  };
}

export async function fetchGoldEtfHoldingsIncremental(
  metadata: unknown,
  obsStart: string,
): Promise<FetchIncrementalResult> {
  const { product, url, entitlementUrl, fixturePath, entitlementFixturePath, sourceStartDate } = config(metadata);
  const start = new Date(`${obsStart}T00:00:00.000Z`);
  if (product === "gld") {
    const parsed = parseSpdrGldArchive(await fetchOfficialFile(url ?? SPDR_GLD_ARCHIVE_URL, fixturePath));
    const points = parsed.points.filter((point) => point.obsDate >= start);
    return {
      points,
      sourceLatestObsDate: parsed.points.at(-1)?.obsDate ?? null,
      skippedInvalid: parsed.skippedInvalid,
    };
  }
  if (product === "iau") {
    const point = parseIauCurrentTonnes(await fetchOfficialHtml(url ?? ISHARES_IAU_PAGE_URL, fixturePath));
    const monthly = fixturePath ? [] : await fetchWgcMonthlyBackfill("iau us equity", start);
    const points = dedupeByDate([...monthly, ...(point.obsDate >= start ? [point] : [])]);
    return {
      points,
      sourceLatestObsDate: point.obsDate,
      skippedInvalid: 0,
    };
  }
  if (product === "globalx-gold") {
    const discovered = fixturePath
      ? { navUrl: url ?? GLOBAL_X_GOLD_NAV_URL, entitlementUrl: entitlementUrl ?? GLOBAL_X_METAL_ENTITLEMENT_URL }
      : await discoverGlobalXGoldFiles(url);
    const parsed = parseGlobalXGoldHoldings(
      await fetchOfficialFile(discovered.navUrl, fixturePath),
      await fetchOfficialFile(discovered.entitlementUrl, entitlementFixturePath),
    );
    const points = parsed.points.filter((point) => point.obsDate >= start);
    return {
      points,
      sourceLatestObsDate: parsed.points.at(-1)?.obsDate ?? null,
      skippedInvalid: parsed.skippedInvalid,
    };
  }
  if (product === "wisdomtree-gbs-barlist" || product === "wisdomtree-sgbs-barlist") {
    const kind = product === "wisdomtree-gbs-barlist" ? "gbs" : "sgbs";
    const defaultUrl = kind === "gbs" ? WISDOMTREE_GBS_BARLIST_URL : WISDOMTREE_SGBS_BARLIST_URL;
    const point = await parseWisdomTreeBarListPdf(await fetchOfficialFile(url ?? defaultUrl, fixturePath), kind);
    const ticker = kind === "gbs" ? "gbs ln equity" : "sgbs ln equity";
    const monthly = fixturePath ? [] : await fetchWgcMonthlyBackfill(ticker, start);
    const points = dedupeByDate([...monthly, ...(point.obsDate >= start ? [point] : [])]);
    return {
      points,
      sourceLatestObsDate: point.obsDate,
      skippedInvalid: 0,
    };
  }
  if (product === "wgc-phau-monthly") {
    const parsed = parseWgcPhauMonthlyHoldings(
      await fetchWgcGoldEtfWorkbook(url ?? WGC_GOLD_ETF_PAGE_URL, fixturePath),
    );
    const cutover = sourceStartDate ? new Date(`${sourceStartDate}T00:00:00.000Z`) : start;
    const lowerBound = cutover > start ? cutover : start;
    const points = parsed.points.filter((point) => point.obsDate >= lowerBound);
    return {
      points,
      sourceLatestObsDate: parsed.points.at(-1)?.obsDate ?? null,
      skippedInvalid: parsed.skippedInvalid,
    };
  }
  throw new Error(`未识别黄金 ETF 产品：${product ?? "(missing)"}`);
}
