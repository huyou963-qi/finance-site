/**
 * 亚特兰大联储 GDPNow —— 仅作对照基准。
 *
 * 它是第三方模型输出、季内逐次改写，按宏观库约束**不入库**；服务端经统一 FRED adapter 读取
 * ALFRED 历次版本（FRED 序列 GDPNOW，2016 年起，每次更新一个版本），进程内缓存 6 小时，
 * 失败时页面不画该线。口径：与本模型同一信息时点——取 as-of 日（含）之前的最后一次 nowcast。
 * 来源：https://www.atlantafed.org/cqer/research/gdpnow
 */
import { fetchFredVintages } from "@/lib/data/scheduler/adapters/fredAdapter";
import { FRED_REALTIME_MAX } from "@/lib/data/macroObservationVintages";
import type { RevisionLedger } from "./model";

export const GDPNOW_PAGE_URL = "https://www.atlantafed.org/cqer/research/gdpnow";

const CACHE_TTL_MS = 6 * 3_600_000;
const FAILURE_RETRY_MS = 10 * 60_000;

let cache: { at: number; data: RevisionLedger | null } | null = null;

export async function loadGdpNow(): Promise<RevisionLedger | null> {
  if (cache) {
    const ttl = cache.data ? CACHE_TTL_MS : FAILURE_RETRY_MS;
    if (Date.now() - cache.at < ttl) return cache.data;
  }
  try {
    const apiKey = process.env.FRED_API_KEY;
    if (!apiKey) throw new Error("缺少 FRED_API_KEY");
    const { vintages } = await fetchFredVintages({
      apiKey,
      seriesId: "GDPNOW",
      realtimeStart: "2011-01-01",
      realtimeEnd: FRED_REALTIME_MAX,
    });
    const data: RevisionLedger = new Map();
    for (const v of vintages) {
      const q = v.obsDate.toISOString().slice(0, 10);
      const list = data.get(q) ?? [];
      list.push({ at: v.availableAt.toISOString().slice(0, 10), value: v.value });
      data.set(q, list);
    }
    for (const list of data.values()) list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    cache = { at: Date.now(), data };
    return data;
  } catch (error) {
    console.warn(`[usGdpNowcast] GDPNow 读取失败：${error instanceof Error ? error.message : error}`);
    cache = { at: Date.now(), data: null };
    return null;
  }
}
