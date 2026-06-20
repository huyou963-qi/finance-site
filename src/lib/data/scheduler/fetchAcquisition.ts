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

export function readFetchAcquisition(
  metadata: unknown,
): FetchAcquisitionRecord | null {
  if (!metadata || typeof metadata !== "object") return null;
  const fa = (metadata as Record<string, unknown>).fetchAcquisition;
  if (!fa || typeof fa !== "object") return null;
  const r = fa as Record<string, unknown>;
  if (r.status !== "known" && r.status !== "pending") return null;
  return {
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
}

export function mergeFetchAcquisition(
  metadata: unknown,
  record: FetchAcquisitionRecord,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object"
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  base.fetchAcquisition = record;
  return base;
}
