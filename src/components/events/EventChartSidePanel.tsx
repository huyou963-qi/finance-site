"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type RefObject,
} from "react";
import { EventPanel, type EventPanelProps } from "@/components/events/EventPanel";

/** 宏观 / 行情页共用的图表联动事件面板入参 */
export type ChartLinkedEventPanelProps = Pick<
  EventPanelProps,
  | "rangeFrom"
  | "rangeTo"
  | "trackDate"
  | "contextCountries"
  | "contextIndustries"
  | "contextAssets"
  | "contextMacroKeys"
  | "className"
>;

const DOCKED_MIN_PX = 220;
const DOCKED_MAX_FRAC = 0.5;
const DOCKED_OPEN_KEY = "chart-event-panel-open-v1";

export type EventChartSidePanelProps = ChartLinkedEventPanelProps & {
  /** docked：行情页 K 线右侧可折叠侧栏；embedded：宏观页图形设置 Tab 内嵌 */
  variant: "docked" | "embedded";
  /** docked 时用于计算宽度的行容器 */
  splitRowRef?: RefObject<HTMLDivElement | null>;
};

export function EventChartSidePanel({
  variant,
  splitRowRef,
  className = "",
  ...eventProps
}: EventChartSidePanelProps) {
  if (variant === "embedded") {
    return <EventPanel embedded {...eventProps} className={className} />;
  }

  return (
    <DockedEventSidePanel
      splitRowRef={splitRowRef}
      className={className}
      {...eventProps}
    />
  );
}

function DockedEventSidePanel({
  splitRowRef,
  className,
  ...eventProps
}: ChartLinkedEventPanelProps & {
  splitRowRef?: RefObject<HTMLDivElement | null>;
}) {
  const [open, setOpen] = useState(true);
  const [widthPx, setWidthPx] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DOCKED_OPEN_KEY);
      if (raw === "0") setOpen(false);
    } catch {
      /* ignore */
    }
  }, []);

  const setOpenPersist = useCallback((next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(DOCKED_OPEN_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  useLayoutEffect(() => {
    if (!open || widthPx !== null || !splitRowRef?.current) return;
    const w = splitRowRef.current.clientWidth;
    if (w > 0) {
      setWidthPx(Math.max(DOCKED_MIN_PX, Math.round(w * 0.28)));
    }
  }, [open, widthPx, splitRowRef]);

  const startResize = useCallback(
    (downEvent: React.MouseEvent) => {
      downEvent.preventDefault();
      const row = splitRowRef?.current;
      if (!row) return;
      const startX = downEvent.clientX;
      const startW = widthPx ?? Math.max(DOCKED_MIN_PX, Math.round(row.clientWidth * 0.28));

      const onMove = (ev: MouseEvent) => {
        const cw = splitRowRef?.current?.clientWidth ?? startW + startX;
        const maxW = Math.floor(cw * DOCKED_MAX_FRAC);
        const delta = startX - ev.clientX;
        const next = Math.min(maxW, Math.max(DOCKED_MIN_PX, startW + delta));
        setWidthPx(next);
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.removeProperty("cursor");
        document.body.style.removeProperty("user-select");
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);

      if (widthPx === null) setWidthPx(startW);
    },
    [splitRowRef, widthPx],
  );

  if (!open) {
    return (
      <div className="flex w-9 shrink-0 flex-col border-l border-fs-border bg-fs-bg/90">
        <button
          type="button"
          onClick={() => setOpenPersist(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-3 text-[11px] leading-tight text-fs-muted transition hover:bg-fs-elevated hover:text-fs-text"
          title="展开事件记录"
        >
          <span>事</span>
          <span>件</span>
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        title="拖拽调节事件面板宽度"
        onMouseDown={startResize}
        className="group w-1.5 shrink-0 cursor-col-resize border-x border-fs-border bg-fs-elevated/90 hover:bg-cyan-950/80"
      >
        <span className="mx-auto block h-full w-px bg-fs-border group-hover:bg-cyan-500" />
      </div>
      <aside
        className={`flex max-w-[50%] min-h-0 shrink-0 flex-col overflow-hidden border-l border-fs-border bg-fs-bg/85 ${className}`}
        style={
          widthPx !== null
            ? { width: widthPx, flex: "0 0 auto" }
            : { flex: "0 0 28%", minWidth: DOCKED_MIN_PX }
        }
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-fs-border px-2 py-1.5">
          <h3 className="text-[11px] font-semibold text-fs-text">事件记录</h3>
          <button
            type="button"
            onClick={() => setOpenPersist(false)}
            className="shrink-0 rounded border border-fs-border px-2 py-0.5 text-[11px] text-fs-muted hover:border-fs-border hover:text-fs-text"
            title="收起事件面板"
          >
            收起
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 py-2">
          <EventPanel embedded {...eventProps} className="min-h-0 flex-1" />
        </div>
      </aside>
    </>
  );
}
