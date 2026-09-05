import type { FetchIncrementalResult, ObservationPoint } from "../types";
import {
  ISM_OFFICIAL_MFG_SERIES,
  ISM_OFFICIAL_SVC_SERIES,
  PR_NEWSWIRE_ISM_LIST_URL,
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
import {
  clearPrNewswireHtmlCache,
  loadPrNewswireHtml,
} from "../ismOfficial/prNewswire/client";
import { latestPrNewswireEntry, parsePrNewswireListPage } from "../ismOfficial/prNewswire/parseList";
import { parsePrNewswireReport } from "../ismOfficial/prNewswire/parseReport";
import { loadTradingEconomicsIndicatorHtml } from "../tradingEconomicsIndicator/client";
import { TE_ISM_PAGE_URL } from "../tradingEconomicsIndicator/ismCatalog";
import { TE_ISM_SVC_PAGE_URL } from "../tradingEconomicsIndicator/ismSvcCatalog";
import {
  parseTradingEconomicsIsmPage,
  seriesPointForTeLabel as manufacturingPointForTeLabel,
  type TeIsmParsedPage,
} from "../tradingEconomicsIndicator/parseIsmPage";
import {
  parseTradingEconomicsIsmSvcPage,
  seriesPointForTeLabel as servicesPointForTeLabel,
} from "../tradingEconomicsIndicator/parseIsmSvcPage";

const TE_MISMATCH_WARN = 0.05;

type ReportCache = { at: number; parsed: IsmOfficialParsedReport; url: string };
const reportCache = new Map<IsmOfficialReportKind, ReportCache>();
const reportFailureCache = new Map<IsmOfficialReportKind, { at: number; message: string }>();
const teReportCache = new Map<IsmOfficialReportKind, ReportCache>();
const prNewswireReportCache = new Map<IsmOfficialReportKind, { at: number; parsed: IsmOfficialParsedReport }>();
const prNewswireFailureCache = new Map<IsmOfficialReportKind, { at: number; message: string }>();
const CACHE_MS = 60_000;

export type IsmPreferredReport = {
  parsed: IsmOfficialParsedReport;
  source: "ism_official" | "pr_newswire" | "tradingeconomics";
  officialError: string | null;
};

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
    const failed = reportFailureCache.get(kind);
    if (failed && Date.now() - failed.at < CACHE_MS) {
      throw new Error(failed.message);
    }
  }
  try {
    const loaded = await loadLatestIsmOfficialReportHtml(kind, { fixturePath });
    const parsed = parseIsmOfficialReport(loaded.html, kind);
    if (!fixturePath) {
      reportCache.set(kind, { at: Date.now(), parsed, url: loaded.url });
      reportFailureCache.delete(kind);
    }
    return parsed;
  } catch (err) {
    if (!fixturePath) {
      reportFailureCache.set(kind, {
        at: Date.now(),
        message: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  }
}

export function convertTePageToIsmReport(
  kind: IsmOfficialReportKind,
  parsedTe: TeIsmParsedPage,
): IsmOfficialParsedReport {
  const defs = kind === "manufacturing" ? ISM_OFFICIAL_MFG_SERIES : ISM_OFFICIAL_SVC_SERIES;
  const pointsByCode = new Map<string, ObservationPoint>();
  for (const def of defs) {
    if (!def.teLabel) continue;
    const point =
      kind === "manufacturing"
        ? manufacturingPointForTeLabel(parsedTe, def.teLabel)
        : servicesPointForTeLabel(parsedTe, def.teLabel);
    if (!point) continue;
    pointsByCode.set(def.code, { obsDate: point.obsDate, value: point.value });
  }
  const obsDates = [...pointsByCode.values()].map((point) => point.obsDate.getTime());
  if (!obsDates.length) {
    throw new Error(`TE ${kind} 页面未解析到任何 ISM 分项`);
  }
  const obsDate = new Date(Math.max(...obsDates));
  return {
    kind,
    obsDate,
    titleMonthText: obsDate.toISOString().slice(0, 7),
    pointsByCode,
  };
}

async function getTeReport(kind: IsmOfficialReportKind): Promise<IsmOfficialParsedReport> {
  const hit = teReportCache.get(kind);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.parsed;
  const url = kind === "manufacturing" ? TE_ISM_PAGE_URL : TE_ISM_SVC_PAGE_URL;
  const html = await loadTradingEconomicsIndicatorHtml({ defaultUrl: url });
  const parsedTe =
    kind === "manufacturing"
      ? parseTradingEconomicsIsmPage(html)
      : parseTradingEconomicsIsmSvcPage(html);
  const parsed = convertTePageToIsmReport(kind, parsedTe);
  teReportCache.set(kind, { at: Date.now(), parsed, url });
  return parsed;
}

async function getPrNewswireReport(kind: IsmOfficialReportKind): Promise<IsmOfficialParsedReport> {
  const hit = prNewswireReportCache.get(kind);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.parsed;
  const failed = prNewswireFailureCache.get(kind);
  if (failed && Date.now() - failed.at < CACHE_MS) {
    throw new Error(failed.message);
  }
  try {
    const listHtml = await loadPrNewswireHtml({ url: PR_NEWSWIRE_ISM_LIST_URL });
    const entries = parsePrNewswireListPage(listHtml);
    const latest = latestPrNewswireEntry(entries, kind);
    if (!latest) {
      throw new Error(`PR Newswire 新闻列表未找到 ${kind} 报告链接`);
    }
    const reportHtml = await loadPrNewswireHtml({ url: latest.url });
    const parsed = parsePrNewswireReport(reportHtml, kind);
    prNewswireReportCache.set(kind, { at: Date.now(), parsed });
    prNewswireFailureCache.delete(kind);
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    prNewswireFailureCache.set(kind, { at: Date.now(), message });
    throw err;
  }
}

async function prNewswireFallbackPoint(
  kind: IsmOfficialReportKind,
  code: string,
  obsStart: string,
): Promise<FetchIncrementalResult> {
  const def = ismOfficialSeriesByCode(code);
  const parsed = await getPrNewswireReport(kind);
  const point = parsed.pointsByCode.get(code);
  if (!point) {
    throw new Error(`PR Newswire ${kind} 报告未包含 ${def?.officialLabel ?? code}`);
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
  const parsed = await getTeReport(kind);
  const def = (kind === "manufacturing" ? ISM_OFFICIAL_MFG_SERIES : ISM_OFFICIAL_SVC_SERIES).find(
    (row) => row.teLabel === teLabel,
  );
  const point = def ? parsed.pointsByCode.get(def.code) ?? null : null;
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
    const parsed = await getTeReport(kind);
    const def = (kind === "manufacturing" ? ISM_OFFICIAL_MFG_SERIES : ISM_OFFICIAL_SVC_SERIES).find(
      (row) => row.teLabel === teLabel,
    );
    return def ? parsed.pointsByCode.get(def.code)?.value ?? null : null;
  } catch (err) {
    console.warn(
      `[ism-official] TE 校对跳过：${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * worker 增量：ISM 官网月报为主，TE 仅校对；官网失败时按优先级兜底：
 * PR Newswire 新闻稿（分项覆盖更全）→ TE（分项覆盖较窄）→ 都失败才报错。
 */
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
    const attempts = [`官网：${officialErr}`];

    if (def.prNewswireLabel) {
      try {
        const result = await prNewswireFallbackPoint(def.kind, def.code, obsStart);
        console.warn(`[ism-official] 官网失败，改用 PR Newswire 兜底 ${def.code}：${officialErr}`);
        return result;
      } catch (prErr) {
        attempts.push(`PR Newswire：${prErr instanceof Error ? prErr.message : String(prErr)}`);
      }
    }

    if (def.teLabel) {
      try {
        const result = await teFallbackPoint(def.kind, def.teLabel, obsStart);
        console.warn(
          `[ism-official] 官网${def.prNewswireLabel ? "/PR Newswire" : ""}均失败，改用 TE 兜底 ${def.code}：${officialErr}`,
        );
        return result;
      } catch (teErr) {
        attempts.push(`TE：${teErr instanceof Error ? teErr.message : String(teErr)}`);
      }
    }

    if (!def.prNewswireLabel && !def.teLabel) {
      throw new Error(`${officialErr}（该分项无 PR Newswire/TE 兜底）`);
    }
    throw new Error(`${attempts.join("；")}（所有兜底均失败）`);
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

/**
 * 手工整包同步：始终先取 ISM 官网；官网不可达时整页回退 PR Newswire 新闻稿
 * （分项覆盖更全，含官网 fixture 场景不涉及的 customers_inventories/new_export_orders/
 * imports/inventory_sentiment 等）；PR Newswire 也不可达时再退到 TE 已覆盖分项。
 */
export async function fetchPreferredIsmReport(
  kind: IsmOfficialReportKind,
  options?: { fixturePath?: string },
): Promise<IsmPreferredReport> {
  try {
    return {
      parsed: await fetchAllIsmOfficialPoints(kind, options),
      source: "ism_official",
      officialError: null,
    };
  } catch (err) {
    const officialError = err instanceof Error ? err.message : String(err);
    try {
      const parsed = await getPrNewswireReport(kind);
      return { parsed, source: "pr_newswire", officialError };
    } catch (prErr) {
      console.warn(
        `[ism-official] PR Newswire 整页回退也失败，改用 TE：${prErr instanceof Error ? prErr.message : String(prErr)}`,
      );
      const parsed = await getTeReport(kind);
      return { parsed, source: "tradingeconomics", officialError };
    }
  }
}

export function clearIsmOfficialAdapterCache(): void {
  reportCache.clear();
  reportFailureCache.clear();
  teReportCache.clear();
  prNewswireReportCache.clear();
  prNewswireFailureCache.clear();
  clearIsmOfficialHtmlCache();
  clearPrNewswireHtmlCache();
}
