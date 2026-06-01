import { randomUUID } from "@/lib/randomId";

/** 跨标签页宏观图表「页面同步」广播（同源 BroadcastChannel） */
export const MACRO_PAGE_SYNC_CHANNEL = "finance-site-macro-sync-v1";

export type MacroSyncMessage =
  | {
      v: 1;
      type: "crosshair";
      tabId: string;
      timeLabel: string | null;
    }
  | {
      v: 1;
      type: "visible-range";
      tabId: string;
      startPct: number;
      endPct: number;
      fromLabel: string | null;
      toLabel: string | null;
    };

let macroTabIdMemo: string | null = null;

export function getOrCreateMacroSyncTabId(): string {
  if (typeof window === "undefined") return "ssr";
  if (!macroTabIdMemo) {
    macroTabIdMemo = randomUUID();
  }
  return macroTabIdMemo;
}
