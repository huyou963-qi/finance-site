/** 跨标签页 K 线「页面同步」广播（同源 BroadcastChannel） */
export const KLINE_PAGE_SYNC_CHANNEL = "finance-site-kline-sync-v1";

/** 区间统计：用柱起始/结束的 Unix 秒对齐不同标的 */
export type RangeStatWireSegment = {
  color: string;
  fromTime: number;
  toTime: number;
};

export type KlineSyncMessage =
  | {
      v: 1;
      type: "leader";
      tabId: string;
      interval: string;
      from: number;
      to: number;
      /** 区间统计条目的时间锚点 */
      rangeStats: RangeStatWireSegment[];
    }
  | {
      v: 1;
      type: "visible-range";
      tabId: string;
      from: number;
      to: number;
    }
  | {
      v: 1;
      type: "interval";
      tabId: string;
      interval: string;
    }
  | {
      v: 1;
      type: "crosshair";
      tabId: string;
      time: number | null;
    }
  | {
      v: 1;
      type: "range-stats";
      tabId: string;
      ranges: RangeStatWireSegment[];
    };

let tabIdMemo: string | null = null;

export function getOrCreateKlineSyncTabId(): string {
  if (typeof window === "undefined") return "ssr";
  if (!tabIdMemo) {
    tabIdMemo = crypto.randomUUID();
  }
  return tabIdMemo;
}
