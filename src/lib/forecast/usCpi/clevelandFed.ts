/**
 * 克利夫兰联储 Inflation Nowcasting —— 仅作对照基准。
 *
 * 它是第三方模型输出、每个交易日改写，按宏观库约束**不入库**；服务端读取官网图表数据
 * （公开 JSON，每个目标月一个块，含逐日 nowcast），进程内缓存 6 小时，失败时页面不画该线。
 *
 * 口径：与本模型同一信息时点——取目标月内 22 日（含）之前的最后一次 nowcast。
 * 数组按「非 vline」类别对齐（vline 是 CPI/PCE 发布标记，不带数据点）。
 * 来源：https://www.clevelandfed.org/indicators-and-data/inflation-nowcasting
 */
export const CLEVELAND_NOWCAST_URL =
  "https://www.clevelandfed.org/-/media/files/webcharts/inflationnowcasting/nowcast_month.json";
export const CLEVELAND_NOWCAST_PAGE = "https://www.clevelandfed.org/indicators-and-data/inflation-nowcasting";

const CACHE_TTL_MS = 6 * 3_600_000;
const FAILURE_RETRY_MS = 10 * 60_000;

export type ClevelandMonth = {
  /** 目标月 YYYY-MM-01 */
  month: string;
  /** 22 日（含）之前最后一次 nowcast（季调环比 %）及其日期 MM/DD */
  asOf: { all: number; core: number; label: string } | null;
  /** 该目标月最新一次 nowcast */
  latest: { all: number; core: number; label: string } | null;
};

type RawBlock = {
  chart?: { subcaption?: string };
  categories?: Array<{ category?: Array<{ label?: string; vline?: string }> }>;
  dataset?: Array<{ seriesname?: string; data?: Array<{ value?: string }> }>;
};

export function parseClevelandNowcast(raw: unknown, cutoffDay = 22): Map<string, ClevelandMonth> {
  const out = new Map<string, ClevelandMonth>();
  if (!Array.isArray(raw)) throw new Error("克利夫兰联储 nowcast：根节点不是数组（源结构可能已变）");
  for (const block of raw as RawBlock[]) {
    const m = /^(\d{4})-(\d{1,2})$/.exec(block.chart?.subcaption?.trim() ?? "");
    if (!m) continue;
    const month = `${m[1]}-${m[2]!.padStart(2, "0")}-01`;
    const targetMm = Number(m[2]);
    const labels = (block.categories?.[0]?.category ?? []).filter((c) => !c.vline).map((c) => c.label ?? "");
    const series = (name: string) => block.dataset?.find((s) => s.seriesname === name)?.data ?? [];
    const cpi = series("CPI Inflation");
    const core = series("Core CPI Inflation");
    let asOf: ClevelandMonth["asOf"] = null;
    let latest: ClevelandMonth["latest"] = null;
    labels.forEach((label, i) => {
      const a = Number(cpi[i]?.value);
      const c = Number(core[i]?.value);
      if (cpi[i]?.value === "" || core[i]?.value === "" || !Number.isFinite(a) || !Number.isFinite(c)) return;
      const point = { all: a, core: c, label };
      latest = point;
      const [mm, dd] = label.split("/").map(Number);
      if (mm === targetMm && dd !== undefined && dd <= cutoffDay) asOf = point;
    });
    out.set(month, { month, asOf, latest });
  }
  return out;
}

let cache: { at: number; data: Map<string, ClevelandMonth> | null } | null = null;

/** 读取并缓存；源站不可达时返回 null（页面降级为不画对照线），10 分钟后再试 */
export async function loadClevelandNowcast(): Promise<Map<string, ClevelandMonth> | null> {
  if (cache) {
    const ttl = cache.data ? CACHE_TTL_MS : FAILURE_RETRY_MS;
    if (Date.now() - cache.at < ttl) return cache.data;
  }
  try {
    const res = await fetch(CLEVELAND_NOWCAST_URL, {
      headers: { "User-Agent": "finance-site/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = parseClevelandNowcast(await res.json());
    cache = { at: Date.now(), data };
    return data;
  } catch (error) {
    console.warn(`[usCpiNowcast] 克利夫兰联储 nowcast 读取失败：${error instanceof Error ? error.message : error}`);
    cache = { at: Date.now(), data: null };
    return null;
  }
}
