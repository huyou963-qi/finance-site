/**
 * BIS 统计局 SDMX API 探测（偿债率 WS_DSR、信贷/GDP 缺口 WS_CREDIT_GAP）
 * 文档：https://stats.bis.org/api-doc/v2/
 */

export type BisProbeResult = {
  ok: boolean;
  flowId: string;
  seriesKey: string;
  apiUrl: string;
  portalUrl: string;
  sampleObsDate?: string;
  sampleValue?: number;
  error?: string;
};

const BIS_API_V1 = "https://stats.bis.org/api/v1/data";

/** debtcap sectorCode → BIS 借款人部门维度（CL_TC_BORROWERS / CL_DSR_BORROWERS） */
const BIS_SECTOR_SUFFIX: Record<string, string | null> = {
  household: "H",
  non_financial_corporate: "N",
  private_non_financial: "P",
  government: "G",
};

const METRIC_TO_BIS_FLOW: Record<string, string | null> = {
  debt_service: "WS_DSR",
  leverage: "WS_TC",
  leverage_nominal: "WS_TC",
};

/** BIS 各数据流当前版本（WS_TC 是 2.0，用 1.0 请求会 404） */
export const BIS_FLOW_VERSION: Record<string, string> = {
  WS_TC: "2.0",
  WS_DSR: "1.0",
  WS_CREDIT_GAP: "1.0",
};

export function bisFlowVersion(flowId: string): string {
  return BIS_FLOW_VERSION[flowId] ?? "1.0";
}

/** WS_DSR 只发布 H/N/P，没有政府部门 */
const BIS_DSR_SECTORS = new Set(["H", "N", "P"]);

function portalUrl(flowId: string, seriesKey: string): string {
  if (flowId === "WS_DSR") {
    return "https://data.bis.org/topics/DSR";
  }
  if (flowId === "WS_CREDIT_GAP") {
    return "https://data.bis.org/topics/CREDIT_GAP";
  }
  if (flowId === "WS_TC") {
    return "https://data.bis.org/topics/TOTAL_CREDIT";
  }
  return "https://www.bis.org/statistics/";
}

function buildApiUrl(flowId: string, seriesKey: string): string {
  const endYear = new Date().getUTCFullYear() + 1;
  return (
    `${BIS_API_V1}/BIS,${flowId},${bisFlowVersion(flowId)}/${seriesKey}` +
    `?startPeriod=2020-Q1&endPeriod=${endYear}-Q4&format=csv`
  );
}

function parseBisCsv(text: string): { date: string; value: number } | null {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const header = lines[0]!.split(",");
  const timeIdx = header.indexOf("TIME_PERIOD");
  const valIdx = header.indexOf("OBS_VALUE");
  if (timeIdx < 0 || valIdx < 0) return null;
  const last = lines[lines.length - 1]!.split(",");
  const value = Number(last[valIdx]);
  const date = last[timeIdx]?.trim() ?? "";
  if (!Number.isFinite(value) || !date) return null;
  return { value, date };
}

function parseBisJsonData(json: unknown): { date: string; value: number } | null {
  const root = json as {
    dataSets?: Array<{
      series?: Record<
        string,
        { observations?: Record<string, [number | string, ...unknown[]]> }
      >;
    }>;
  };
  const series = root.dataSets?.[0]?.series;
  if (!series) return null;
  const firstKey = Object.keys(series)[0];
  if (!firstKey) return null;
  const obs = series[firstKey]?.observations;
  if (!obs) return null;
  const keys = Object.keys(obs).sort((a, b) => Number(a) - Number(b));
  const lastKey = keys[keys.length - 1];
  if (lastKey == null) return null;
  const tuple = obs[lastKey];
  if (!tuple || tuple.length < 2) return null;
  const value = typeof tuple[0] === "number" ? tuple[0] : Number(tuple[0]);
  if (!Number.isFinite(value)) return null;
  const dateIdx = typeof tuple[1] === "number" ? tuple[1] : Number(tuple[1]);
  return { value, date: String(dateIdx) };
}

/** 从 debtcap 元数据或 code 构造 BIS 序列键，如 Q.US.H */
export function bisSeriesKeyFromDebtcapMeta(meta: {
  countryCode?: string;
  metricCode?: string;
  sectorCode?: string;
  code?: string;
}): { flowId: string; seriesKey: string } | null {
  let cc = String(meta.countryCode ?? "").trim().toUpperCase();
  let metric = String(meta.metricCode ?? "").trim();
  let sector = String(meta.sectorCode ?? "").trim();
  if ((!cc || !metric || !sector) && meta.code) {
    const parsed = parseDebtcapInstrumentCode(meta.code);
    if (parsed) {
      cc = cc || parsed.countryCode;
      metric = metric || parsed.metricCode;
      sector = sector || parsed.sectorCode;
    }
  }
  const flowId = METRIC_TO_BIS_FLOW[metric];
  if (!flowId || !/^[A-Z]{2}$/.test(cc)) return null;

  const suffix = BIS_SECTOR_SUFFIX[sector];
  if (!suffix) return null;

  if (flowId === "WS_TC") {
    // 总信贷流：FREQ.BORROWERS_CTY.TC_BORROWERS.TC_LENDERS.VALUATION.UNIT_TYPE.TC_ADJUST
    // 770 = Percentage of GDP；leverage 用市值（M），leverage_nominal 用名义价值（N）
    const valuation = metric === "leverage_nominal" ? "N" : "M";
    return { flowId, seriesKey: `Q.${cc}.${suffix}.A.${valuation}.770.A` };
  }

  // WS_DSR 只覆盖 H/N/P
  if (!BIS_DSR_SECTORS.has(suffix)) return null;
  return { flowId, seriesKey: `Q.${cc}.${suffix}` };
}

const DEBTCAP_METRICS = ["leverage_nominal", "debt_service", "leverage"] as const;

/** debtcap_us_debt_service_non_financial_corporate */
export function parseDebtcapInstrumentCode(
  code: string,
): { countryCode: string; metricCode: string; sectorCode: string } | null {
  const m = /^debtcap_([a-z]{2})_(.+)$/i.exec(code.trim());
  if (!m) return null;
  const countryCode = m[1]!.toUpperCase();
  const rest = m[2]!;
  for (const metricCode of DEBTCAP_METRICS) {
    const prefix = `${metricCode}_`;
    if (rest.startsWith(prefix)) {
      const sectorCode = rest.slice(prefix.length);
      if (sectorCode) {
        return { countryCode, metricCode, sectorCode };
      }
    }
  }
  return null;
}

const BIS_PORTAL = "https://www.bis.org/statistics/";

export async function probeBisForDebtcapInstrument(
  meta: Record<string, unknown>,
  code: string,
): Promise<BisProbeResult | null> {
  const isDebtcap =
    code.startsWith("debtcap_") || String(meta.sourceTag ?? "") === "debt-capacity-xlsx";
  if (!isDebtcap) return null;

  const agency = String(meta.source ?? meta.providerNote ?? "").trim();
  if (agency && agency !== "国际清算银行" && agency !== "-") return null;

  const mapped = bisSeriesKeyFromDebtcapMeta({
    countryCode: typeof meta.countryCode === "string" ? meta.countryCode : undefined,
    metricCode: typeof meta.metricCode === "string" ? meta.metricCode : undefined,
    sectorCode: typeof meta.sectorCode === "string" ? meta.sectorCode : undefined,
    code,
  });
  if (!mapped) {
    return {
      ok: false,
      flowId: "—",
      seriesKey: "—",
      apiUrl: "",
      portalUrl: BIS_PORTAL,
      error: "政府部门等指标暂无 BIS 序列映射",
    };
  }
  return probeBisSeries(mapped.flowId, mapped.seriesKey);
}

export async function probeBisSeries(
  flowId: string,
  seriesKey: string,
): Promise<BisProbeResult> {
  const apiUrl = buildApiUrl(flowId, seriesKey);
  const portal = portalUrl(flowId, seriesKey);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25_000);
    const res = await fetch(apiUrl, {
      signal: ctrl.signal,
      headers: { Accept: "text/csv, */*" },
    });
    clearTimeout(t);
    if (!res.ok) {
      return {
        ok: false,
        flowId,
        seriesKey,
        apiUrl,
        portalUrl: portal,
        error: `HTTP ${res.status}`,
      };
    }
    const text = await res.text();
    const parsed = parseBisCsv(text);
    if (!parsed) {
      return {
        ok: false,
        flowId,
        seriesKey,
        apiUrl,
        portalUrl: portal,
        error: "CSV 响应无有效观测",
      };
    }
    return {
      ok: true,
      flowId,
      seriesKey,
      apiUrl,
      portalUrl: portal,
      sampleValue: parsed.value,
      sampleObsDate: parsed.date,
    };
  } catch (e) {
    return {
      ok: false,
      flowId,
      seriesKey,
      apiUrl,
      portalUrl: portal,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
