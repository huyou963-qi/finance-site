import type { FetchIncrementalResult, ObservationPoint } from "../types";

const ESTAT_BASE = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData";

function parseYmd(raw: string): Date | null {
  const s = raw.trim();
  if (/^\d{8}$/.test(s)) {
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(4, 6));
    const d = Number(s.slice(6, 8));
    return new Date(Date.UTC(y, m - 1, d || 1));
  }
  if (/^\d{6}$/.test(s)) {
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(4, 6));
    return new Date(Date.UTC(y, m - 1, 1));
  }
  if (/^\d{4}$/.test(s)) {
    return new Date(Date.UTC(Number(s), 0, 1));
  }
  return null;
}

/** 解析 e-Stat getStatsData JSON（供单测与 fetch 共用） */
export function parseEStatObservations(json: unknown): ObservationPoint[] {
  const root = json as {
    GET_STATS_DATA?: {
      STATISTICAL_DATA?: {
        DATA_INF?: { VALUE?: unknown[] | unknown };
      };
    };
  };
  const values = root.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE;
  const rows = Array.isArray(values) ? values : values ? [values] : [];
  const points: ObservationPoint[] = [];

  for (const row of rows) {
    const r = row as { "@time"?: string; time?: string; $?: string; value?: string };
    const time = r["@time"] ?? r.time;
    const valRaw = r.$ ?? r.value;
    if (!time || valRaw == null) continue;
    const value = Number(String(valRaw).replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    const obsDate = parseYmd(String(time));
    if (!obsDate) continue;
    points.push({ obsDate, value });
  }

  points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  return points;
}

function obsStartEStatParam(observationStart: string): string | undefined {
  if (!observationStart || observationStart === "1950-01-01") return undefined;
  return observationStart.replace(/-/g, "");
}

/**
 * sourceSeriesKey 格式：`statsDataId` 或 `statsDataId|cdCat01`
 * 需环境变量 ESTAT_APP_ID
 */
export async function fetchEStatIncremental(
  sourceSeriesKey: string,
  observationStart: string,
): Promise<FetchIncrementalResult> {
  const appId = process.env.ESTAT_APP_ID?.trim();
  if (!appId) throw new Error("未配置 ESTAT_APP_ID");

  const [statsDataId, cdCat01] = sourceSeriesKey.split("|");
  if (!statsDataId) throw new Error("e-Stat sourceSeriesKey 无效");

  const params = new URLSearchParams({
    appId,
    statsDataId,
    lang: "E",
  });
  const start = obsStartEStatParam(observationStart);
  if (start) params.set("startTime", start);
  if (cdCat01) params.set("cdCat01", cdCat01);

  const url = `${ESTAT_BASE}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`e-Stat HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const points = parseEStatObservations(json);
  const sourceLatestObsDate = points.length ? points[points.length - 1]!.obsDate : null;
  return { points, sourceLatestObsDate, skippedInvalid: 0 };
}
