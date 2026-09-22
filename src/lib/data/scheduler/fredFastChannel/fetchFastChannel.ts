import type { FetchIncrementalResult, ObservationPoint } from "../types";
import { TREASURY_RATES_CSV_BASE, type FredFastChannel, type TreasuryCurveType } from "./catalog";

const USER_AGENT = "Mozilla/5.0 (compatible; finance-site-data-scheduler/1.0)";
const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; text: string }>();

async function fetchCsv(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.text;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/csv,*/*" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const text = await res.text();
  cache.set(url, { at: Date.now(), text });
  return text;
}

export function clearFredFastChannelCache(): void {
  cache.clear();
}

function splitCsvLine(line: string): string[] {
  return line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

/** MM/DD/YYYY → YYYY-MM-DD；非法返回 null */
function isoFromUs(date: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

/** 解析「日期列 + 若干数值列」的 CSV，取 column 列；空值/非数跳过。 */
export function parseDatedCsvColumn(text: string, dateColumn: string, column: string): Map<string, number> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const out = new Map<string, number>();
  if (lines.length === 0) return out;
  const header = splitCsvLine(lines[0]!);
  const di = header.indexOf(dateColumn);
  const vi = header.indexOf(column);
  if (di < 0 || vi < 0) throw new Error(`CSV 缺列 ${dateColumn}/${column}（表头：${header.join("|")}）`);
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const date = isoFromUs(cells[di] ?? "");
    const value = Number(cells[vi]);
    if (!date || cells[vi] === "" || !Number.isFinite(value)) continue;
    // FRED 以两位小数发布这些序列；CBOE CSV 是 14.870000
    out.set(date, Math.round(value * 100) / 100);
  }
  return out;
}

function treasuryUrl(curve: TreasuryCurveType, year: number): string {
  return `${TREASURY_RATES_CSV_BASE}/${year}/all?type=${curve}&field_tdr_date_value=${year}&page&_format=csv`;
}

/** 官方渠道在 since（不含）之后的观测，按日期升序。 */
export async function fetchFastChannelPointsAfter(
  channel: FredFastChannel,
  since: string,
): Promise<ObservationPoint[]> {
  const values = new Map<string, number>();
  if (channel.kind === "treasury") {
    // 财政部 CSV 按自然年分文件；跨年时（FRED 还停在去年底）两年都取
    const thisYear = new Date().getUTCFullYear();
    const fromYear = Math.min(thisYear, Number(since.slice(0, 4)) || thisYear);
    for (let y = Math.max(fromYear, thisYear - 1); y <= thisYear; y++) {
      const text = await fetchCsv(treasuryUrl(channel.curve, y));
      for (const [d, v] of parseDatedCsvColumn(text, "Date", channel.column)) values.set(d, v);
    }
  } else {
    const text = await fetchCsv(channel.csvUrl);
    for (const [d, v] of parseDatedCsvColumn(text, "DATE", "CLOSE")) values.set(d, v);
  }
  return [...values]
    .filter(([d]) => d > since)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, value]) => ({ obsDate: new Date(`${d}T00:00:00.000Z`), value }));
}

/**
 * FRED 结果 + 官方首发渠道：只追加 FRED 最新日期之后的观测。
 * 官方渠道失败不影响 FRED 结果（记 warn，本轮只写 FRED）。
 */
export async function extendWithFastChannel(
  seriesId: string,
  channel: FredFastChannel,
  fred: FetchIncrementalResult,
  fetchStart: string,
): Promise<FetchIncrementalResult> {
  const fredLatest = fred.sourceLatestObsDate?.toISOString().slice(0, 10) ?? null;
  // FRED 窗口内一条都没有（极少见：窗口很短或 FRED 故障）时从 fetchStart 前一天起补
  const since = fredLatest ?? new Date(Date.parse(`${fetchStart}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10);
  let extra: ObservationPoint[];
  try {
    extra = await fetchFastChannelPointsAfter(channel, since);
  } catch (error) {
    console.warn(
      `[fred-fast-channel] ${seriesId} ← ${channel.label} 失败，本轮只用 FRED：${error instanceof Error ? error.message : String(error)}`,
    );
    return fred;
  }
  if (extra.length === 0) return fred;
  return {
    points: [...fred.points, ...extra],
    sourceLatestObsDate: extra[extra.length - 1]!.obsDate,
    skippedInvalid: fred.skippedInvalid,
  };
}
