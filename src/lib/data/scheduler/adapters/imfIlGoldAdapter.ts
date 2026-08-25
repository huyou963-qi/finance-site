import type { FetchIncrementalResult, ObservationPoint } from "../types";

export const IMF_IL_GOLD_KEY = "G001.RGV_REVS.FTO.M";
export const IMF_IL_GOLD_URL =
  `https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.STA/IL/+/${IMF_IL_GOLD_KEY}` +
  "?dimensionAtObservation=TIME_PERIOD&attributes=all&measures=all";

const TROY_OUNCES_PER_METRIC_TON = 32_150.74656862798;
const LEGACY_AVOIRDUPOIS_OUNCES_PER_KG = 35.2739619495804;
const CACHE_TTL_MS = 10 * 60_000;

export type ImfIlGoldTransform = "metric_tons" | "legacy_avoirdupois_million_ounces";

type ImfGoldPoint = { obsDate: Date; rawFineTroyOunces: number };
let cache: { fetchedAt: number; points: ImfGoldPoint[] } | null = null;

function monthEnd(period: string): Date | null {
  const match = /^(\d{4})-M(\d{2})$/.exec(period);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month, 0));
}

export function parseImfIlGoldResponse(payload: unknown): ImfGoldPoint[] {
  const root = payload as {
    data?: {
      dataSets?: Array<{
        structure?: number;
        series?: Record<string, { observations?: Record<string, unknown[]> }>;
      }>;
      structures?: Array<{
        dimensions?: {
          series?: Array<{ id?: string; values?: Array<{ id?: string }> }>;
          observation?: Array<{ id?: string; values?: Array<{ value?: string }> }>;
        };
      }>;
    };
  };
  const dataSet = root.data?.dataSets?.[0];
  const structure = root.data?.structures?.[dataSet?.structure ?? 0];
  if (!dataSet || !structure) throw new Error("IMF IL response missing dataset structure");

  const expected = new Map([
    ["COUNTRY", "G001"],
    ["INDICATOR", "RGV_REVS"],
    ["UNIT", "FTO"],
    ["FREQUENCY", "M"],
  ]);
  const seen = new Set<string>();
  for (const dimension of structure.dimensions?.series ?? []) {
    const want = dimension.id ? expected.get(dimension.id) : undefined;
    if (want && dimension.id) seen.add(dimension.id);
    if (want && dimension.values?.[0]?.id !== want) {
      throw new Error(`IMF IL unexpected ${dimension.id}: ${dimension.values?.[0]?.id ?? "missing"}`);
    }
  }
  for (const dimensionId of expected.keys()) {
    if (!seen.has(dimensionId)) throw new Error(`IMF IL response missing ${dimensionId} identity`);
  }

  const time = structure.dimensions?.observation?.find((dimension) => dimension.id === "TIME_PERIOD");
  const series = Object.values(dataSet.series ?? {});
  if (series.length !== 1) throw new Error(`IMF IL expected one gold series, received ${series.length}`);
  const observations = series[0]?.observations;
  if (!time?.values || !observations) throw new Error("IMF IL response missing monthly observations");

  const points: ImfGoldPoint[] = [];
  for (const [indexRaw, values] of Object.entries(observations)) {
    const period = time.values[Number(indexRaw)]?.value;
    const obsDate = period ? monthEnd(period) : null;
    const rawFineTroyOunces = Number(values[0]);
    if (!obsDate || !Number.isFinite(rawFineTroyOunces) || rawFineTroyOunces <= 0) continue;
    points.push({ obsDate, rawFineTroyOunces });
  }
  points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  if (points.length < 500) throw new Error(`IMF IL gold history unexpectedly short: ${points.length}`);
  return points;
}

async function fetchFullHistory(): Promise<ImfGoldPoint[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.points;
  const response = await fetch(IMF_IL_GOLD_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "finance-site/1.0 IMF official data ingestion",
    },
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    throw new Error(`IMF IL SDMX HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`);
  }
  const points = parseImfIlGoldResponse(await response.json());
  cache = { fetchedAt: Date.now(), points };
  return points;
}

function transformValue(rawFineTroyOunces: number, transform: ImfIlGoldTransform): number {
  const tons = rawFineTroyOunces / TROY_OUNCES_PER_METRIC_TON;
  return transform === "metric_tons"
    ? tons
    : (tons * LEGACY_AVOIRDUPOIS_OUNCES_PER_KG) / 1_000;
}

export async function fetchImfIlGoldIncremental(
  observationStart: string,
  transform: ImfIlGoldTransform,
): Promise<FetchIncrementalResult> {
  const start = new Date(`${observationStart.slice(0, 10)}T00:00:00.000Z`);
  const raw = await fetchFullHistory();
  const points: ObservationPoint[] = raw
    .filter((point) => point.obsDate >= start)
    .map((point) => ({
      obsDate: point.obsDate,
      value: transformValue(point.rawFineTroyOunces, transform),
    }));
  return {
    points,
    sourceLatestObsDate: raw.at(-1)?.obsDate ?? null,
    skippedInvalid: 0,
  };
}
