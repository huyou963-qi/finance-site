/** 写入 Instrument.metadata.fetchAcquisition */
export type FetchAcquisitionStatus = "known" | "pending";

export type FetchAcquisitionRecord = {
  status: FetchAcquisitionStatus;
  probedAt: string;
  method?: string;
  methodLabel?: string;
  officialUrl?: string;
  /** 实测可用的 API 请求 URL */
  fetchUrl?: string;
  bisFlowId?: string;
  bisSeriesKey?: string;
  sampleObsDate?: string;
  sampleValue?: number;
  message?: string;
  error?: string;
  agencyHint?: string;
};

const EXCEL_ONLY_METHODS = new Set(["xlsx_reimport", "excel_bootstrap"]);

/** 是否曾通过 Excel / 本地 xlsx 模板标记为「获取方式」（不算网络自动源） */
export function isExcelOnlyFetchAcquisition(
  record: FetchAcquisitionRecord | null | undefined,
): boolean {
  if (!record) return false;
  if (EXCEL_ONLY_METHODS.has(record.method ?? "")) return true;
  if (record.methodLabel?.includes("Excel")) return true;
  return false;
}

/** 仪器是否来自 Excel 导入 / overview xlsx 模板（含 chov/jpov 等 sourceTag） */
export function isExcelTemplateInstrument(metadata: unknown): boolean {
  const md =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>)
      : null;
  if (!md) return false;
  if (md.bootstrap === "excel") return true;
  const tag = String(md.sourceTag ?? "").trim();
  if (!tag) return false;
  // 延迟 import 避免循环依赖；与 agencyRegistry.XLSX_IMPORT_BY_SOURCE_TAG 对齐
  if (tag.endsWith("-xlsx") || tag.includes("overview-xlsx")) return true;
  return false;
}

/**
 * 管理页 / 调度逻辑用：Excel 类 fetchAcquisition 一律视为 pending
 */
export function effectiveFetchAcquisition(
  metadata: unknown,
  record: FetchAcquisitionRecord | null,
): FetchAcquisitionRecord | null {
  const excelInstrument = isExcelTemplateInstrument(metadata);

  if (!record) {
    if (!excelInstrument) return null;
    return {
      status: "pending",
      probedAt: "",
      method: "excel_bootstrap",
      methodLabel: "Excel 历史导入",
      message: "须确认 FRED/BIS/REST 等网络自动源；Excel 不可替代",
    };
  }

  if (isExcelOnlyFetchAcquisition(record)) {
    return {
      ...record,
      status: "pending",
      message:
        "Excel 仅历史/补救导入；须人工或 AI 确认网络源并配置订阅后重新探测",
    };
  }

  return record;
}

export function readFetchAcquisition(
  metadata: unknown,
): FetchAcquisitionRecord | null {
  if (!metadata || typeof metadata !== "object") return null;
  const fa = (metadata as Record<string, unknown>).fetchAcquisition;
  if (!fa || typeof fa !== "object") return null;
  const r = fa as Record<string, unknown>;
  if (r.status !== "known" && r.status !== "pending") return null;
  const record: FetchAcquisitionRecord = {
    status: r.status,
    probedAt: String(r.probedAt ?? ""),
    method: typeof r.method === "string" ? r.method : undefined,
    methodLabel: typeof r.methodLabel === "string" ? r.methodLabel : undefined,
    fetchUrl: typeof r.fetchUrl === "string" ? r.fetchUrl : undefined,
    bisFlowId: typeof r.bisFlowId === "string" ? r.bisFlowId : undefined,
    bisSeriesKey: typeof r.bisSeriesKey === "string" ? r.bisSeriesKey : undefined,
    sampleObsDate: typeof r.sampleObsDate === "string" ? r.sampleObsDate : undefined,
    sampleValue: typeof r.sampleValue === "number" ? r.sampleValue : undefined,
    message: typeof r.message === "string" ? r.message : undefined,
    error: typeof r.error === "string" ? r.error : undefined,
    agencyHint: typeof r.agencyHint === "string" ? r.agencyHint : undefined,
  };
  return effectiveFetchAcquisition(metadata, record);
}

export function mergeFetchAcquisition(
  metadata: unknown,
  record: FetchAcquisitionRecord,
): Record<string, unknown> {
  let normalized = record;
  if (isExcelOnlyFetchAcquisition(record)) {
    normalized = {
      ...record,
      status: "pending",
      message:
        record.message ??
        "Excel 仅历史/补救导入；须确认网络自动源（FRED/BIS/REST 等）",
    };
  }

  const base =
    metadata && typeof metadata === "object"
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  base.fetchAcquisition = normalized;
  if (
    normalized.status === "known" &&
    base.bootstrap === "excel" &&
    !isExcelOnlyFetchAcquisition(normalized)
  ) {
    base.bootstrapOnly = false;
  }
  return base;
}
