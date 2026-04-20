import { fredSeriesLabel } from "./macroCatalog";
import type { MacroPayload } from "./types";

export async function fetchFredObservationsMap(
  seriesId: string,
  apiKey: string,
): Promise<Map<string, number | null>> {
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(apiKey)}` +
    `&file_type=json` +
    `&observation_start=1950-01-01`;

  const res = await fetch(url, { next: { revalidate: 86_400 } });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FRED HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json: unknown = await res.json();
  const observations = (json as { observations?: { date: string; value: string }[] })
    ?.observations;

  if (!Array.isArray(observations)) {
    throw new Error(`FRED: missing observations (${seriesId})`);
  }

  const map = new Map<string, number | null>();
  for (const o of observations) {
    const v = parseFloat(o.value);
    map.set(o.date, Number.isFinite(v) ? v : null);
  }
  return map;
}

/**
 * 将日度/不规则日期观测聚合为月度序列：每月取该月**最后一个**观测日对应的值（常见报价/存量类序列）。
 */
export function observationsToMonthlyMap(
  dailyMap: Map<string, number | null>,
): Map<string, number | null> {
  const byMonth = new Map<string, { date: string; val: number }[]>();
  for (const [dateStr, val] of dailyMap) {
    if (val === null || val === undefined || !Number.isFinite(val)) continue;
    if (dateStr.length < 7) continue;
    const ym = dateStr.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym)!.push({ date: dateStr, val });
  }
  const out = new Map<string, number | null>();
  for (const [ym, arr] of byMonth) {
    arr.sort((a, b) => a.date.localeCompare(b.date));
    const last = arr[arr.length - 1];
    out.set(ym, last.val);
  }
  return out;
}

export async function fetchFredMonthlyMap(
  seriesId: string,
  apiKey: string,
): Promise<Map<string, number | null>> {
  const dailyMap = await fetchFredObservationsMap(seriesId, apiKey);
  return observationsToMonthlyMap(dailyMap);
}

/**
 * 按公历年聚合：把年内所有观测（日度/月度）取算术平均，便于与年度宏观指标同轴对比。
 */
export async function fetchFredAnnualMap(
  seriesId: string,
  apiKey: string,
): Promise<Map<string, number | null>> {
  const dailyMap = await fetchFredObservationsMap(seriesId, apiKey);
  const yearBuckets = new Map<string, number[]>();
  for (const [dateStr, val] of dailyMap) {
    if (val === null || val === undefined) continue;
    const year = dateStr.slice(0, 4);
    if (!/^\d{4}$/.test(year)) continue;
    if (!yearBuckets.has(year)) yearBuckets.set(year, []);
    yearBuckets.get(year)!.push(val);
  }
  const out = new Map<string, number | null>();
  for (const [y, arr] of yearBuckets) {
    if (arr.length === 0) out.set(y, null);
    else out.set(y, arr.reduce((a, b) => a + b, 0) / arr.length);
  }
  return out;
}

/** 一次拉取多条 FRED 序列并对齐到同一时间轴（缺失为 null） */
export async function fetchFredSeriesMultiple(seriesIdsRaw: string[]): Promise<MacroPayload> {
  const apiKey = process.env.FRED_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("未配置 FRED_API_KEY（请在 .env.local 中设置）");
  }

  const unique = [
    ...new Set(
      seriesIdsRaw.map((id) => id.trim().toUpperCase()).filter(Boolean),
    ),
  ];

  if (unique.length === 0) {
    throw new Error("至少选择一条 FRED 序列");
  }

  const maps = await Promise.all(
    unique.map(async (id) => {
      if (!/^[A-Z0-9._-]+$/.test(id)) {
        throw new Error(`无效的 FRED series id：${id}`);
      }
      const map = await fetchFredObservationsMap(id, apiKey);
      return { id, map };
    }),
  );

  const dateSet = new Set<string>();
  for (const { map } of maps) {
    for (const d of map.keys()) dateSet.add(d);
  }

  const categories = [...dateSet].sort();

  const series = maps.map(({ id, map }) => ({
    name: `${fredSeriesLabel(id)} (${id})`,
    data: categories.map((d) => (map.has(d) ? (map.get(d) ?? null) : null)),
    key: `fred:${id}`,
  }));

  return {
    title: `美联储 FRED（${unique.length} 条序列）`,
    source: "fred",
    categories,
    series,
    attribution: "FRED / St. Louis Fed（免费 API；请勿超出条款使用）",
  };
}

/** 兼容旧接口：单序列 */
export async function fetchFredSeries(seriesIdRaw: string): Promise<MacroPayload> {
  const id = seriesIdRaw.trim() || "CPIAUCSL";
  return fetchFredSeriesMultiple([id]);
}
