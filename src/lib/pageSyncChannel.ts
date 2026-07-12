import { randomUUID } from "@/lib/randomId";

/**
 * 跨页面「页面同步」桥接广播（同源 BroadcastChannel）。
 *
 * 行情页（K 线，横轴 Unix 秒）与宏观页（ECharts 类目，横轴时间标签）横轴形态不同，
 * 无法直接互传原生时间。此通道以「归一化日期 YYYY-MM-DD（UTC）」为公共货币：
 * 发送端把本地光标/区间折算成日期，接收端再按自身频率把日期「向下取整到所在周期起点」
 * （周初 / 月初 / 季初 / 年初），从而实现日频↔周频↔月频的跨页对齐。
 *
 * 同类页面之间仍走各自的原生通道（kline / macro）保持全保真；本通道只在
 * `kind` 不同的页面之间生效（接收端忽略与自己相同 kind 的消息）。
 */
export const PAGE_SYNC_CHANNEL = "finance-site-page-sync-v1";

export type PageSyncKind = "kline" | "macro";

export type PageSyncMessage =
  | {
      v: 1;
      type: "crosshair";
      tabId: string;
      kind: PageSyncKind;
      /** 光标锚定日期 YYYY-MM-DD（UTC）；null 表示清除 */
      isoDate: string | null;
    }
  | {
      v: 1;
      type: "visible-range";
      tabId: string;
      kind: PageSyncKind;
      /** 可见区间起点日期 YYYY-MM-DD（UTC） */
      fromIso: string | null;
      /** 可见区间终点日期 YYYY-MM-DD（UTC） */
      toIso: string | null;
    };

let pageTabIdMemo: string | null = null;

export function getOrCreatePageSyncTabId(): string {
  if (typeof window === "undefined") return "ssr";
  if (!pageTabIdMemo) {
    pageTabIdMemo = randomUUID();
  }
  return pageTabIdMemo;
}

/** YYYY-MM-DD（UTC）→ 该日 UTC 零点的 Unix 秒；解析失败返回 null */
export function isoDateToUnixSec(iso: string | null): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/**
 * 在「升序」柱起始时间数组里，取起始时间 ≤ target 的最后一根下标，
 * 即 target 所在周期的起点柱（周频 → 周初、月频 → 月初）。
 * 若 target 早于全部柱则退化到第一根（0）；空数组返回 -1。
 */
export function floorBarIndexForTime(sortedTimes: number[], target: number): number {
  if (sortedTimes.length === 0) return -1;
  let idx = -1;
  for (let i = 0; i < sortedTimes.length; i++) {
    const t = sortedTimes[i]!;
    if (t <= target) idx = i;
    else break;
  }
  return idx >= 0 ? idx : 0;
}
