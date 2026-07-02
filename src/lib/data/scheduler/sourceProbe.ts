import { existsSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { SourceAdapterKind } from "@prisma/client";
import { fetchFredIncremental } from "./adapters/fredAdapter";
import type { FetchAcquisitionRecord } from "./fetchAcquisition";
import {
  AGENCY_OFFICIAL_URLS,
  officialUrlForAgency,
  US_AGENCIES_FOR_FRED,
  XLSX_IMPORT_BY_SOURCE_TAG,
} from "./agencyRegistry";
import { probeBisForDebtcapInstrument } from "./bisProbe";
import type { FredRateLimiter } from "./fredRateLimiter";
import { mergedUsovFredMap } from "./usovFredMap";

export type InstrumentProbeInput = {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
  fredSeriesId: string | null;
  metadata: unknown;
  observationCount: number;
  dataSubscription: {
    sourceSeriesKey: string;
    source: { adapterKind: SourceAdapterKind };
  } | null;
};

export type ProbeOutcome = FetchAcquisitionRecord;

function md(meta: unknown): Record<string, unknown> {
  return meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
}

function agencyText(meta: Record<string, unknown>): string {
  const s = String(meta.source ?? meta.providerNote ?? "").trim();
  return s;
}

function displayLabel(meta: Record<string, unknown>, inst: InstrumentProbeInput): string {
  return (
    String(meta.displayName ?? inst.shortName ?? inst.name).trim() || inst.code
  );
}

function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s,;，；]+/gi;
  return [...text.matchAll(re)].map((m) => m[0]!.replace(/[)）]+$/, ""));
}

function extractWorldBankIndicator(text: string): string | null {
  const m = text.match(/\b[A-Z]{2}\.[A-Z0-9._]{2,}\b/);
  return m?.[0] ?? null;
}

function pending(
  partial: Omit<ProbeOutcome, "status" | "probedAt"> & { message: string },
): ProbeOutcome {
  return {
    status: "pending",
    probedAt: new Date().toISOString(),
    ...partial,
  };
}

function known(
  partial: Omit<ProbeOutcome, "status" | "probedAt">,
): ProbeOutcome {
  return {
    status: "known",
    probedAt: new Date().toISOString(),
    ...partial,
  };
}

async function probeHttpHead(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    clearTimeout(t);
    return res.ok || res.status === 405 || res.status === 403;
  } catch {
    return false;
  }
}

async function probeFredSeries(
  seriesId: string,
  apiKey: string,
  method: string,
  methodLabel: string,
  rateLimiter?: FredRateLimiter,
): Promise<ProbeOutcome> {
  const start = new Date();
  start.setUTCMonth(start.getUTCMonth() - 6);
  const observationStart = start.toISOString().slice(0, 10);
  try {
    const result = await fetchFredIncremental(
      seriesId,
      apiKey,
      observationStart,
      rateLimiter,
    );
    if (result.points.length === 0) {
      return pending({
        method,
        methodLabel,
        officialUrl: `https://fred.stlouisfed.org/series/${seriesId}`,
        message: "FRED 序列可访问但近 6 个月无新观测",
        error: "no_recent_points",
      });
    }
    const last = result.points[result.points.length - 1]!;
    return known({
      method,
      methodLabel,
      officialUrl: `https://fred.stlouisfed.org/series/${seriesId}`,
      sampleObsDate: last.obsDate.toISOString().slice(0, 10),
      sampleValue: last.value,
      message: `FRED 拉取成功（${result.points.length} 个观测点）`,
    });
  } catch (e) {
    return pending({
      method,
      methodLabel,
      officialUrl: `https://fred.stlouisfed.org/series/${seriesId}`,
      message: "FRED API 请求失败",
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function probeFredSearch(
  searchText: string,
  apiKey: string,
  rateLimiter?: FredRateLimiter,
): Promise<ProbeOutcome | null> {
  const q = searchText.trim().slice(0, 80);
  if (!q) return null;
  const url =
    `https://api.stlouisfed.org/fred/series/search` +
    `?search_text=${encodeURIComponent(q)}` +
    `&search_type=full_text&limit=1` +
    `&api_key=${encodeURIComponent(apiKey)}` +
    `&file_type=json`;
  try {
    const limiter = rateLimiter;
    const res = limiter ? await limiter.fetch(url) : await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      seriess?: { id?: string; title?: string }[];
    };
    const hit = json.seriess?.[0]?.id;
    if (!hit) {
      return pending({
        method: "fred_search",
        methodLabel: "FRED 关键词搜索",
        message: `FRED 未找到与「${q}」匹配的序列`,
        error: "fred_search_empty",
      });
    }
    return probeFredSeries(
      hit,
      apiKey,
      "fred_search",
      `FRED 搜索命中 ${hit}`,
      rateLimiter,
    );
  } catch {
    return null;
  }
}

async function probeWorldBank(
  countryCode: string,
  indicatorId: string,
): Promise<ProbeOutcome> {
  const url =
    `https://api.worldbank.org/v2/country/${countryCode}/indicator/${indicatorId}` +
    `?format=json&date=2018:2030&per_page=5`;
  const pageUrl = `https://data.worldbank.org/indicator/${indicatorId}?locations=${countryCode}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return pending({
        method: "worldbank_api",
        methodLabel: "世界银行开放 API",
        officialUrl: pageUrl,
        message: "世行 API 请求失败",
        error: `HTTP ${res.status}`,
      });
    }
    const json = (await res.json()) as unknown[];
    const rows = (json[1] ?? []) as { date?: string; value?: number | null }[];
    const valid = rows.filter((r) => r.value != null && Number.isFinite(r.value));
    if (valid.length === 0) {
      return pending({
        method: "worldbank_api",
        methodLabel: "世界银行开放 API",
        officialUrl: pageUrl,
        message: "世行 API 无有效观测",
        error: "no_values",
      });
    }
    const last = valid[valid.length - 1]!;
    return known({
      method: "worldbank_api",
      methodLabel: "世界银行开放 API",
      officialUrl: pageUrl,
      sampleObsDate: last.date ? `${last.date}-01-01` : undefined,
      sampleValue: last.value ?? undefined,
      message: "世行 API 拉取成功",
    });
  } catch (e) {
    return pending({
      method: "worldbank_api",
      methodLabel: "世界银行开放 API",
      officialUrl: pageUrl,
      message: "世行 API 异常",
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

function probeXlsxReimport(meta: Record<string, unknown>): ProbeOutcome | null {
  const tag = String(meta.sourceTag ?? "").trim();
  const cfg = XLSX_IMPORT_BY_SOURCE_TAG[tag];
  if (!cfg) return null;
  const exists = existsSync(cfg.defaultPath);
  return pending({
    method: "xlsx_reimport",
    methodLabel: "Excel 模板再导入",
    message: exists
      ? `检测到本地模板 ${cfg.script}；Excel 不可替代网络自动源，须确认 FRED/BIS/REST 等`
      : `模板文件不存在：${cfg.defaultPath}`,
    error: exists ? "xlsx_not_network_source" : "xlsx_missing",
    agencyHint: agencyText(meta),
  });
}

function probeLegacyH(meta: Record<string, unknown>, obsCount: number): ProbeOutcome {
  const note = String(meta.providerNote ?? "").trim();
  const url = note ? officialUrlForAgency(note) : undefined;
  if (obsCount > 0) {
    return pending({
      method: "legacy_h_snapshot",
      methodLabel: "历史库 h 迁移快照",
      agencyHint: note || undefined,
      officialUrl: url,
      message:
        "数据来自 MySQL h 库迁移，在线自动更新方式待对接（需确认原 Wind/来源 API）",
    });
  }
  return pending({
    method: "legacy_h_snapshot",
    methodLabel: "历史库 h 迁移",
    message: "无观测点",
    error: "no_observations",
  });
}

function dbSourceLabel(meta: Record<string, unknown>): string | null {
  const s = String(meta.source ?? meta.providerNote ?? "").trim();
  return s && s !== "-" ? s : null;
}

export async function probeInstrumentAcquisition(
  inst: InstrumentProbeInput,
  options: { fredApiKey?: string; fredRateLimiter?: FredRateLimiter },
): Promise<ProbeOutcome> {
  const meta = md(inst.metadata);
  const agency = agencyText(meta);
  const countryCode = String(meta.countryCode ?? meta.region ?? "").trim().toUpperCase();
  const label = displayLabel(meta, inst);
  const fredLimiter = options.fredRateLimiter;

  const dbSource = dbSourceLabel(meta);

  // 国际清算银行 / debtcap → BIS SDMX（优先于 xlsx）
  if (
    agency === "国际清算银行" ||
    inst.code.startsWith("debtcap_") ||
    meta.sourceTag === "debt-capacity-xlsx"
  ) {
    const bis = await probeBisForDebtcapInstrument(
      { ...meta, source: meta.source || (inst.code.startsWith("debtcap_") ? "国际清算银行" : "") },
      inst.code,
    );
    if (bis) {
      if (bis.ok) {
        return known({
          method: "bis_sdmx",
          methodLabel: `BIS SDMX（${bis.flowId} / ${bis.seriesKey}）`,
          officialUrl: bis.portalUrl,
          fetchUrl: bis.apiUrl,
          bisFlowId: bis.flowId,
          bisSeriesKey: bis.seriesKey,
          sampleObsDate: bis.sampleObsDate,
          sampleValue: bis.sampleValue,
          agencyHint: dbSource ?? agency,
          message: `已从 BIS 拉取样本点（${bis.flowId} ${bis.seriesKey}）`,
        });
      }
      return pending({
        method: "bis_sdmx",
        methodLabel: "BIS SDMX",
        officialUrl: bis.portalUrl || AGENCY_OFFICIAL_URLS["国际清算银行"],
        fetchUrl: bis.apiUrl || undefined,
        agencyHint: dbSource ?? agency,
        message: bis.error ?? "BIS 序列拉取失败",
        error: bis.error,
      });
    }
  }

  // 2) 已配置 FRED 订阅
  if (
    inst.dataSubscription?.source.adapterKind === SourceAdapterKind.FRED_API &&
    options.fredApiKey
  ) {
    return probeFredSeries(
      inst.dataSubscription.sourceSeriesKey,
      options.fredApiKey,
      "subscription_fred",
      "FRED 定时订阅 API",
      fredLimiter,
    );
  }

  const usovFredMap = mergedUsovFredMap();
  const fredFromCode = inst.code.match(/^sched_fred_(.+)$/i)?.[1]?.toUpperCase();
  const fredFromUsov = usovFredMap[inst.code];
  const fredId = inst.fredSeriesId?.toUpperCase() ?? fredFromCode ?? fredFromUsov;
  if (fredId && options.fredApiKey) {
    return probeFredSeries(fredId, options.fredApiKey, "fred_api", "FRED API", fredLimiter);
  }

  // 4) 元数据中的 URL
  const urlCandidates = [
    ...extractUrls(agency),
    ...extractUrls(String(meta.source ?? "")),
    ...extractUrls(String(meta.providerNote ?? "")),
  ];
  for (const u of urlCandidates) {
    const ok = await probeHttpHead(u);
    if (ok) {
      return known({
        method: "http_url",
        methodLabel: "来源链接可访问",
        officialUrl: u,
        message: "来源字段中的 URL 可访问（具体解析规则待实现）",
      });
    }
  }

  // 5) Excel 模板再导入 — metadata.bootstrap=excel 仅历史补救，不算持续获取方式
  const xlsx =
    meta.bootstrap === "excel" ? null : probeXlsxReimport(meta);
  if (xlsx) {
    if (xlsx.status === "known") return xlsx;
    if (xlsx.status === "pending" && !inst.code.startsWith("usov_")) return xlsx;
  }

  // 6) 世行指标码
  const wbId =
    extractWorldBankIndicator(agency) ||
    extractWorldBankIndicator(String(meta.source ?? ""));
  if (wbId && countryCode.length === 2) {
    return probeWorldBank(countryCode, wbId);
  }

  // 7) 美国机构 → FRED 搜索
  if (
    options.fredApiKey &&
    (US_AGENCIES_FOR_FRED.has(agency) ||
      countryCode === "US" ||
      inst.code.startsWith("usov_"))
  ) {
    const searched = await probeFredSearch(label, options.fredApiKey, fredLimiter);
    if (searched) return searched;
  }

  // 8) xlsx pending（usov 等：文件缺失时仍返回 pending）
  if (xlsx?.status === "pending") return xlsx;

  // 9) legacy m_
  if (inst.code.startsWith("m_")) {
    return probeLegacyH(meta, inst.observationCount);
  }

  // 11) 国际清算银行（非 debtcap 或未映射）
  if (agency === "国际清算银行") {
    const bisUrl = AGENCY_OFFICIAL_URLS["国际清算银行"]!;
    const ok = await probeHttpHead("https://stats.bis.org/api/v1/datastructure");
    if (ok) {
      return pending({
        method: "bis_sdmx",
        methodLabel: "BIS 统计局 SDMX API",
        officialUrl: bisUrl,
        agencyHint: agency,
        message: "BIS API 可达，但序列级映射尚未配置",
      });
    }
    return pending({
      method: "bis_manual",
      methodLabel: "国际清算银行",
      officialUrl: bisUrl,
      agencyHint: agency,
      message: "需在 BIS 统计库中确认序列 ID 后接入",
    });
  }

  // 11) 有观测 + 仅机构名
  const official = agency ? officialUrlForAgency(agency) : undefined;
  if (inst.observationCount > 0 && agency && agency !== "-") {
    return pending({
      method: "agency_unknown",
      methodLabel: "机构已登记",
      officialUrl: official,
      agencyHint: agency,
      message: `库内已有 ${inst.observationCount} 条观测，自动拉取方式待确认`,
    });
  }

  if (agency && agency !== "-") {
    return pending({
      method: "agency_unknown",
      methodLabel: "来源机构",
      officialUrl: official,
      agencyHint: agency,
      message: "尚未确认在线获取方式",
    });
  }

  if (meta.bootstrap === "excel") {
    return pending({
      method: "excel_bootstrap",
      methodLabel: "Excel 历史导入",
      agencyHint: dbSource ?? undefined,
      message:
        "已导入历史观测；持续更新须人工或 AI 确认网络源（FRED/BIS/REST 等）并配置订阅",
    });
  }

  return pending({
    method: "unknown",
    methodLabel: "未知",
    message: "缺少来源机构与获取路径信息",
    error: "no_source_metadata",
  });
}

export async function loadInstrumentsForProbe(
  prisma: PrismaClient,
  scope: "imported" | "all",
): Promise<InstrumentProbeInput[]> {
  const where =
    scope === "all"
      ? { kind: "MACRO_SERIES" as const }
      : {
          kind: "MACRO_SERIES" as const,
          OR: [
            { code: { startsWith: "jpov_" } },
            { code: { startsWith: "chov_" } },
            { code: { startsWith: "usov_" } },
            { code: { startsWith: "debtcap_" } },
            { code: { startsWith: "sched_fred_" } },
            { code: { startsWith: "m_" } },
          ],
        };

  const rows = await prisma.instrument.findMany({
    where,
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      shortName: true,
      fredSeriesId: true,
      metadata: true,
      dataSubscription: {
        select: {
          sourceSeriesKey: true,
          source: { select: { adapterKind: true } },
        },
      },
      _count: { select: { macroPoints: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    shortName: r.shortName,
    fredSeriesId: r.fredSeriesId,
    metadata: r.metadata,
    observationCount: r._count.macroPoints,
    dataSubscription: r.dataSubscription,
  }));
}

export async function saveProbeResult(
  prisma: PrismaClient,
  instrumentId: string,
  metadata: unknown,
  outcome: ProbeOutcome,
): Promise<void> {
  const { mergeFetchAcquisition } = await import("./fetchAcquisition");
  await prisma.instrument.update({
    where: { id: instrumentId },
    data: { metadata: mergeFetchAcquisition(metadata, outcome) as object },
  });
}
