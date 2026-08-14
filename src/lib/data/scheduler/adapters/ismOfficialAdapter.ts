import type { FetchIncrementalResult, ObservationPoint } from "../types";
import {
  ismOfficialSeriesByCode,
  type IsmOfficialReportKind,
} from "../ismOfficial/catalog";
import {
  clearIsmOfficialHtmlCache,
  loadLatestIsmOfficialReportHtml,
} from "../ismOfficial/client";
import {
  parseIsmOfficialReport,
  pointForOfficialCode,
  type IsmOfficialParsedReport,
} from "../ismOfficial/parseReport";
import { loadTradingEconomicsIndicatorHtml } from "../tradingEconomicsIndicator/client";
import { TE_ISM_PAGE_URL } from "../tradingEconomicsIndicator/ismCatalog";
import { TE_ISM_SVC_PAGE_URL } from "../tradingEconomicsIndicator/ismSvcCatalog";
import { parseTradingEconomicsIsmPage } from "../tradingEconomicsIndicator/parseIsmPage";
import { parseTradingEconomicsIsmSvcPage } from "../tradingEconomicsIndicator/parseIsmSvcPage";

const TE_MISMATCH_WARN = 0.05;

type ReportCache = { at: number; parsed: IsmOfficialParsedReport; url: string };
const reportCache = new Map<IsmOfficialReportKind, ReportCache>();
const CACHE_MS = 60_000;

function readFixturePath(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const scrape = (metadata as Record<string, unknown>).scrape;
  if (!scrape || typeof scrape !== "object") return undefined;
  const path = (scrape as Record<string, unknown>).fixturePath;
  return typeof path === "string" && path.trim() ? path.trim() : undefined;
}

async function getOfficialReport(
  kind: IsmOfficialReportKind,
  metadata: unknown,
): Promise<IsmOfficialParsedReport> {
  const fixturePath = readFixturePath(metadata);
  if (!fixturePath) {
    const hit = reportCache.get(kind);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.parsed;
  }
  const loaded = await loadLatestIsmOfficialReportHtml(kind, { fixturePath });
  const parsed = parseIsmOfficialReport(loaded.html, kind);
  if (!fixturePath) {
    reportCache.set(kind, { at: Date.now(), parsed, url: loaded.url });
  }
  return parsed;
}

function warnTeMismatch(
  code: string,
  official: ObservationPoint,
  teValue: number | null,
): void {
  if (teValue == null) return;
  const diff = Math.abs(official.value - teValue);
  if (diff > TE_MISMATCH_WARN) {
    console.warn(
      `[ism-official] TE 校对不一致 ${code}: official=${official.value} te=${teValue} Δ=${diff.toFixed(2)}（仍写入官网值）`,
    );
  }
}

async function teFallbackPoint(
  kind: IsmOfficialReportKind,
  teLabel: string,
  obsStart: string,
): Promise<FetchIncrementalResult> {
  const html = await loadTradingEconomicsIndicatorHtml({
    defaultUrl: kind === "manufacturing" ? TE_ISM_PAGE_URL : TE_ISM_SVC_PAGE_URL,
  });
  const parsed =
    kind === "manufacturing"
      ? parseTradingEconomicsIsmPage(html)
      : parseTradingEconomicsIsmSvcPage(html);
  const point =
    parsed.headline?.label === teLabel
      ? parsed.headline
      : parsed.components.find((c) => c.label === teLabel) ?? null;
  if (!point) {
    return { points: [], skippedInvalid: 0, sourceLatestObsDate: null };
  }
  const start = new Date(`${obsStart}T00:00:00.000Z`);
  if (point.obsDate < start) {
    return { points: [], skippedInvalid: 0, sourceLatestObsDate: point.obsDate };
  }
  return {
    points: [{ obsDate: point.obsDate, value: point.value }],
    skippedInvalid: 0,
    sourceLatestObsDate: point.obsDate,
  };
}

async function teValueForLabel(
  kind: IsmOfficialReportKind,
  teLabel: string,
): Promise<number | null> {
  try {
    const html = await loadTradingEconomicsIndicatorHtml({
      defaultUrl: kind === "manufacturing" ? TE_ISM_PAGE_URL : TE_ISM_SVC_PAGE_URL,
    });
    const parsed =
      kind === "manufacturing"
        ? parseTradingEconomicsIsmPage(html)
        : parseTradingEconomicsIsmSvcPage(html);
    if (parsed.headline?.label === teLabel) return parsed.headline.value;
    return parsed.components.find((c) => c.label === teLabel)?.value ?? null;
  } catch (err) {
    console.warn(
      `[ism-official] TE 校对跳过：${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/** worker 增量：ISM 官网月报为主，TE 仅校对；官网失败且 TE 有该分项时兜底 */
export async function fetchIsmOfficialIncremental(
  metadata: unknown,
  instrumentCode: string,
  obsStart: string,
): Promise<FetchIncrementalResult> {
  const def = ismOfficialSeriesByCode(instrumentCode);
  if (!def) {
    throw new Error(`未知 ISM 官网仪器代码：${instrumentCode}`);
  }

  try {
    const parsed = await getOfficialReport(def.kind, metadata);
    const point = pointForOfficialCode(parsed, def.code);
    if (!point) {
      throw new Error(`ISM 官网 ${def.kind} 报告未包含 ${def.officialLabel}`);
    }
    if (def.teLabel && !readFixturePath(metadata)) {
      warnTeMismatch(def.code, point, await teValueForLabel(def.kind, def.teLabel));
    }
    const start = new Date(`${obsStart}T00:00:00.000Z`);
    if (point.obsDate < start) {
      return { points: [], skippedInvalid: 0, sourceLatestObsDate: point.obsDate };
    }
    return {
      points: [point],
      skippedInvalid: 0,
      sourceLatestObsDate: parsed.obsDate,
    };
  } catch (err) {
    const officialErr = err instanceof Error ? err.message : String(err);
    if (!def.teLabel) {
      throw new Error(`${officialErr}（该分项无 TE 兜底）`);
    }
    console.warn(`[ism-official] 官网失败，改用 TE 兜底 ${def.code}：${officialErr}`);
    return teFallbackPoint(def.kind, def.teLabel, obsStart);
  }
}

export async function fetchAllIsmOfficialPoints(
  kind: IsmOfficialReportKind,
  options?: { fixturePath?: string },
) {
  const loaded = await loadLatestIsmOfficialReportHtml(kind, {
    fixturePath: options?.fixturePath,
  });
  return parseIsmOfficialReport(loaded.html, kind);
}

export function clearIsmOfficialAdapterCache(): void {
  reportCache.clear();
  clearIsmOfficialHtmlCache();
}
