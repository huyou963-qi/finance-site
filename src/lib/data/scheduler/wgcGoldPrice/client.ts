import { WGC_GOLD_PRICE_SOURCE } from "./catalog";

/**
 * 接口按窗口长度决定粒度（2026-09-21 实测）：
 * - 约 30 天以内 → 每 30 分钟的**盘中实时价**（含周末），不是 LBMA 定盘价；
 * - 30 天到约两年 → 日度定盘价（时间戳为 UTC 零点）；更长会被降采样。
 * 所以每段窗口限定在 [MIN, MAX] 天之间：尾段不足 MIN 时往前延伸（重叠部分按日期去重）。
 */
export const WGC_MAX_WINDOW_DAYS = 300;
export const WGC_MIN_WINDOW_DAYS = 60;

const DAY_MS = 86_400_000;

type WgcChartResponse = {
  chartData?: Record<string, unknown> & { asOfDate?: unknown };
};

/**
 * 解析 `chartData.<CCY> = [[毫秒时间戳, 价格], ...]` → 按日期去重排序的点。
 * 只收 UTC 零点的点（日度定盘价）；盘中点即便混进来也丢弃，不会被当成当日定盘价写库。
 */
export function parseWgcGoldPrice(
  json: unknown,
  currency: string,
): Array<{ date: string; value: number }> {
  const rows = (json as WgcChartResponse)?.chartData?.[currency.toUpperCase()];
  if (!Array.isArray(rows)) throw new Error(`WGC 金价响应缺少 chartData.${currency.toUpperCase()}`);
  const byDate = new Map<string, number>();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const [ts, value] = row as [unknown, unknown];
    if (typeof ts !== "number" || typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    if (ts % DAY_MS !== 0) continue;
    byDate.set(new Date(ts).toISOString().slice(0, 10), value);
  }
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

/** 把 [start, end] 切成长度在 [MIN, MAX] 天之间的窗口（毫秒）；过短的尾段往前延伸 */
export function wgcWindows(startMs: number, endMs: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let s = startMs; s <= endMs; s += WGC_MAX_WINDOW_DAYS * DAY_MS) {
    const e = Math.min(endMs, s + WGC_MAX_WINDOW_DAYS * DAY_MS - 1);
    out.push([Math.min(s, e - WGC_MIN_WINDOW_DAYS * DAY_MS), e]);
  }
  return out;
}

export function wgcPriceUrl(currency: string, unit: string): string {
  return WGC_GOLD_PRICE_SOURCE.baseUrl.replace("/usd/oz", `/${currency}/${unit}`);
}

export async function fetchWgcGoldPrice(opts: {
  currency: string;
  unit: string;
  startDate: string;
  endDate?: Date;
}): Promise<Array<{ date: string; value: number }>> {
  const startMs = Date.parse(`${opts.startDate}T00:00:00.000Z`);
  const endMs = (opts.endDate ?? new Date()).getTime() + DAY_MS;
  const base = wgcPriceUrl(opts.currency, opts.unit);
  const byDate = new Map<string, number>();
  for (const [s, e] of wgcWindows(startMs, endMs)) {
    const res = await fetch(`${base}/${s},${e}`, {
      headers: {
        Accept: "application/json",
        Referer: WGC_GOLD_PRICE_SOURCE.pageUrl,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`WGC 金价接口 HTTP ${res.status}`);
    for (const p of parseWgcGoldPrice(await res.json(), opts.currency)) byDate.set(p.date, p.value);
  }
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}
