"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import { formatEventOccurredAt } from "@/lib/data/marketEvents";
import { buildEventTimeline } from "@/lib/data/marketEventTimeline";
import { EVENT_IMPORTANCE_MIN_ORDER } from "@/lib/data/eventTaxonomy";
import { EventDetailDrawer } from "@/components/events/EventDetailDrawer";
import { EventImportanceBadge } from "@/components/events/EventImportanceBadge";
import {
  EventTimelineCard,
  EventTimelineClusterCard,
} from "@/components/events/horizontal-timeline/EventTimelineCard";
import { TimelineFilterPopover } from "@/components/events/horizontal-timeline/TimelineFilterPopover";
import {
  applyTimelineFilters,
  DEFAULT_TIMELINE_FILTERS,
  type TimelineFilterState,
} from "@/components/events/horizontal-timeline/timelineFilters";
import {
  buildEraBands,
  buildTimelineEventNodes,
  type TimelineEventNode,
} from "@/components/events/horizontal-timeline/timelineLayout";
import {
  BASE_PX_PER_YEAR,
  buildTicks,
  contentWidth,
  packTimelineCards,
  TIMELINE_ORIGIN_YEAR,
  yearToX,
  type PackedItem,
} from "@/components/events/horizontal-timeline/timelinePacking";

const MIN_ZOOM = 0.35;
/** 最大约 5900px/年（≈16px/天），足以把同一周内的事件拉开 */
const MAX_ZOOM = 420;
const CARD_W = 200;
const CARD_GAP = 10;
/** 卡片与主轴之间的距离（连接线长度） */
const STEM_H = 40;
const MIN_CANVAS_H = 480;
/** 视口左右各多渲染一屏，拖动时不闪白 */
const RENDER_MARGIN = 1;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export type HorizontalHistoryTimelineProps = {
  events: MarketEventDto[];
};

export function HorizontalHistoryTimeline({ events }: HorizontalHistoryTimelineProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lastX = useRef(0);
  const zoomRef = useRef(0.85);
  const panXRef = useRef(48);

  const [zoom, setZoom] = useState(0.85);
  const [panX, setPanX] = useState(48);
  const [isDragging, setIsDragging] = useState(false);
  const [selected, setSelected] = useState<TimelineEventNode | null>(null);
  const [drawerEvent, setDrawerEvent] = useState<MarketEventDto | null>(null);
  const [clusterList, setClusterList] = useState<TimelineEventNode[] | null>(null);
  const [viewport, setViewport] = useState({ w: 1200, h: MIN_CANVAS_H });
  const [filters, setFilters] = useState<TimelineFilterState>(DEFAULT_TIMELINE_FILTERS);

  const filteredEvents = useMemo(
    () => applyTimelineFilters(events, filters),
    [events, filters],
  );

  const canvasH = Math.max(MIN_CANVAS_H, viewport.h);
  const eraHeaderH = Math.min(168, Math.max(96, Math.round(canvasH * 0.2)));
  const axisY = Math.round(canvasH * 0.5);
  const aboveH = axisY - 8 - (eraHeaderH + 10);
  const belowH = canvasH - (axisY + 8) - 10;

  const pxPerYear = BASE_PX_PER_YEAR * zoom;
  const width = contentWidth(pxPerYear);

  const timelineModel = useMemo(() => buildEventTimeline(filteredEvents), [filteredEvents]);
  const eraBands = useMemo(() => buildEraBands(timelineModel.groups), [timelineModel.groups]);
  const nodes = useMemo(
    () => buildTimelineEventNodes(filteredEvents, eraBands),
    [filteredEvents, eraBands],
  );
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.event.id, n])), [nodes]);

  const packed = useMemo(
    () =>
      packTimelineCards(
        nodes.map((n) => ({ id: n.event.id, t: n.t })),
        { pxPerYear, cardWidth: CARD_W, gap: CARD_GAP },
      ),
    [nodes, pxPerYear],
  );

  const viewFromX = -panX - viewport.w * RENDER_MARGIN;
  const viewToX = -panX + viewport.w * (1 + RENDER_MARGIN);
  const visiblePacked = packed.filter((p) => p.left + CARD_W >= viewFromX && p.left <= viewToX);
  const visibleNodes = nodes.filter((n) => {
    const x = yearToX(n.t, pxPerYear);
    return x >= viewFromX && x <= viewToX;
  });
  const ticks = useMemo(
    () => buildTicks(pxPerYear, -panX - 80, -panX + viewport.w + 80),
    [pxPerYear, panX, viewport.w],
  );

  useEffect(() => {
    if (selected && !nodeById.has(selected.event.id)) setSelected(null);
  }, [nodeById, selected]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panXRef.current = panX;
  }, [panX]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () =>
      setViewport({ w: el.clientWidth || window.innerWidth, h: el.clientHeight || window.innerHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** 以视口内 anchorX 为锚点缩放到 newZoom */
  const applyZoom = useCallback((newZoomRaw: number, anchorX: number) => {
    const oldZoom = zoomRef.current;
    const newZoom = clamp(newZoomRaw, MIN_ZOOM, MAX_ZOOM);
    if (newZoom === oldZoom) return;
    const newPan = anchorX - (anchorX - panXRef.current) * (newZoom / oldZoom);
    zoomRef.current = newZoom;
    panXRef.current = newPan;
    setZoom(newZoom);
    setPanX(newPan);
  }, []);

  /** 滚轮缩放（以光标位置为锚点，按比例缩放以覆盖百年到周级）；需 passive: false 阻止页面滚动 */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const delta = clamp(e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY, -200, 200);
      applyZoom(zoomRef.current * Math.exp(-delta * 0.0015), e.clientX - rect.left);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyZoom]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, [role=button], [data-no-drag]")) return;
    dragging.current = true;
    setIsDragging(true);
    lastX.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastX.current;
    lastX.current = e.clientX;
    setPanX((p) => {
      const next = p + dx;
      panXRef.current = next;
      return next;
    });
  };

  const onPointerUp = () => {
    dragging.current = false;
    setIsDragging(false);
  };

  /** 以视口中心为锚点缩放（手机端没有滚轮，用按钮代替） */
  const zoomBy = (factor: number) => {
    const el = viewportRef.current;
    if (!el) return;
    applyZoom(zoomRef.current * factor, el.clientWidth / 2);
  };

  const selectNode = (node: TimelineEventNode) => {
    setSelected(node);
    setDrawerEvent(node.event);
  };

  /** 聚合卡能否继续放大拆开：同一天的多条事件无论如何放大都会重叠 */
  const clusterCanExpand = (item: PackedItem) =>
    zoomRef.current < MAX_ZOOM * 0.98 && (item.maxX - item.minX) / pxPerYear > 0.5 / 365;

  const expandCluster = (item: PackedItem, clusterNodes: TimelineEventNode[]) => {
    if (!clusterCanExpand(item)) {
      setClusterList(clusterNodes);
      return;
    }
    // 把聚合范围铺满约八成视口；事件很多时逐级下钻，避免一步跳到周级而丢失上下文
    const spanYears = Math.max((item.maxX - item.minX) / pxPerYear, 1 / 365);
    const targetZoom = clamp(
      (viewport.w * 0.8) / spanYears / BASE_PX_PER_YEAR,
      zoomRef.current * 1.5,
      MAX_ZOOM,
    );
    const midYear = TIMELINE_ORIGIN_YEAR + (item.minX + item.maxX) / 2 / pxPerYear;
    const newPan = viewport.w / 2 - yearToX(midYear, BASE_PX_PER_YEAR * targetZoom);
    zoomRef.current = targetZoom;
    panXRef.current = newPan;
    setZoom(targetZoom);
    setPanX(newPan);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={viewportRef}
        className={`relative min-h-0 flex-1 touch-none overflow-hidden bg-fs-bg select-none ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="pointer-events-none absolute right-3 top-3 z-[55]">
          <TimelineFilterPopover filters={filters} onChange={setFilters} />
        </div>

        <div className="absolute bottom-16 right-3 z-[56] flex flex-col overflow-hidden rounded-lg border border-fs-border bg-white shadow-md">
          <button
            type="button"
            onClick={() => zoomBy(1.6)}
            aria-label="放大"
            className="flex h-11 w-11 items-center justify-center text-xl text-fs-secondary hover:bg-fs-elevated active:bg-fs-elevated md:h-9 md:w-9 md:text-lg"
          >
            +
          </button>
          <span className="h-px bg-fs-border" aria-hidden />
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.6)}
            aria-label="缩小"
            className="flex h-11 w-11 items-center justify-center text-xl text-fs-secondary hover:bg-fs-elevated active:bg-fs-elevated md:h-9 md:w-9 md:text-lg"
          >
            −
          </button>
        </div>

        <div
          className="absolute left-0 top-0 will-change-transform"
          style={{
            width,
            height: canvasH,
            transform: `translateX(${panX}px)`,
          }}
        >
          {/* 时代色带（背景） */}
          {eraBands.map((band) => (
            <div
              key={band.id}
              className="absolute top-0 z-0 border-x border-fs-border/50"
              style={{
                left: yearToX(band.fromYear, pxPerYear),
                width: (band.toYear - band.fromYear) * pxPerYear,
                height: canvasH,
                background: band.color,
              }}
            />
          ))}

          {/* 事件卡 / 聚合卡（仅渲染视口附近） */}
          {visiblePacked.map((item) => {
            const isAbove = item.lane === "above";
            const laneH = isAbove ? aboveH : belowH;
            const style: React.CSSProperties = {
              left: item.left,
              width: CARD_W,
              height: laneH,
              ...(isAbove ? { top: axisY - 8 - laneH } : { top: axisY + 8 }),
            };

            if (item.ids.length === 1) {
              const node = nodeById.get(item.ids[0]);
              if (!node) return null;
              const isSelected = selected?.event.id === node.event.id;
              return (
                <div
                  key={node.event.id}
                  className={`pointer-events-none absolute hover:z-[50] ${
                    isSelected ? "z-[49]" : "z-10"
                  }`}
                  style={style}
                >
                  <EventTimelineCard
                    node={node}
                    lane={item.lane}
                    width={CARD_W}
                    stemLength={STEM_H - 8}
                    stemOffset={item.stemOffset}
                    selected={isSelected}
                    onSelect={() => selectNode(node)}
                  />
                </div>
              );
            }

            const clusterNodes = item.ids
              .map((id) => nodeById.get(id))
              .filter((n): n is TimelineEventNode => Boolean(n));
            if (clusterNodes.length === 0) return null;
            const cover = clusterNodes.reduce((best, n) =>
              EVENT_IMPORTANCE_MIN_ORDER[n.event.importance] >
              EVENT_IMPORTANCE_MIN_ORDER[best.event.importance]
                ? n
                : best,
            );
            return (
              <div
                key={`cluster-${item.ids[0]}`}
                className="pointer-events-none absolute z-10 hover:z-[50]"
                style={style}
              >
                <EventTimelineClusterCard
                  nodes={clusterNodes}
                  cover={cover}
                  lane={item.lane}
                  width={CARD_W}
                  stemLength={STEM_H - 8}
                  stemOffset={item.stemOffset}
                  canExpand={clusterCanExpand(item)}
                  onExpand={() => expandCluster(item, clusterNodes)}
                  onSelectEvent={selectNode}
                />
              </div>
            );
          })}

          {/* 时代介绍条（置顶不透明，不被事件卡遮挡；文字跟随视口左缘） */}
          {eraBands.map((band) => {
            const bandLeft = yearToX(band.fromYear, pxPerYear);
            const bandW = (band.toYear - band.fromYear) * pxPerYear;
            const textW = Math.min(bandW, 560);
            const textOffset = clamp(-panX - bandLeft, 0, Math.max(0, bandW - textW));
            return (
              <div
                key={`era-header-${band.id}`}
                className="absolute top-0 z-50 overflow-hidden border-b border-fs-border/60 shadow-sm"
                style={{
                  left: bandLeft,
                  width: bandW,
                  height: eraHeaderH,
                  backgroundColor: band.headerBg,
                }}
              >
                <div
                  className="flex h-full flex-col px-3 py-2"
                  style={{ width: textW, transform: `translateX(${textOffset}px)` }}
                >
                  <p className="shrink-0 text-[10px] font-medium uppercase tracking-widest text-fs-muted">
                    {band.fromYear}–{band.toYear >= 2020 ? "今" : band.toYear}
                  </p>
                  <p className="mt-0.5 shrink-0 truncate text-sm font-semibold text-fs-text">{band.tag}</p>
                  {band.headerSections && band.headerSections.length > 0 && bandW > 120 ? (
                    <div
                      className="mt-1 min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5"
                      data-no-drag
                    >
                      {band.headerSections.map((section) => (
                        <p
                          key={section.title}
                          className="text-[10px] leading-relaxed text-fs-secondary"
                        >
                          <span className="font-medium text-fs-text">【{section.title}】</span>
                          {section.body}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {/* 主轴轨道 */}
          <div
            className="pointer-events-none absolute inset-x-0 z-30"
            style={{ top: axisY - 5, height: 10 }}
            aria-hidden
          >
            <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-fs-border" />
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-fs-accent" />
          </div>

          {/* 聚合卡覆盖的时间范围 */}
          {visiblePacked
            .filter((p) => p.ids.length > 1 && p.maxX - p.minX > 2)
            .map((p) => (
              <div
                key={`range-${p.ids[0]}`}
                className="pointer-events-none absolute z-[31] h-2 -translate-y-1/2 rounded-full bg-fs-accent/35"
                style={{ left: p.minX - 4, width: p.maxX - p.minX + 8, top: axisY }}
                aria-hidden
              />
            ))}

          {/* 刻度与年份/月份 */}
          {ticks.map((t) => (
            <div
              key={t.key}
              className="pointer-events-none absolute z-30 flex -translate-x-1/2 flex-col items-center"
              style={{ left: t.x, top: t.major ? axisY + 14 : axisY + 10 }}
            >
              <div
                className={`rounded-full ${
                  t.major ? "h-2 w-2 bg-fs-accent" : "h-1.5 w-1.5 bg-fs-muted/60"
                }`}
              />
              {t.label ? (
                <span
                  className={`mt-1.5 whitespace-nowrap rounded bg-fs-bg/80 px-1 tabular-nums ${
                    t.major ? "text-sm font-semibold text-fs-text" : "text-xs text-fs-secondary"
                  }`}
                >
                  {t.label}
                </span>
              ) : null}
            </div>
          ))}

          {/* 事件锚点 */}
          {visibleNodes.map((node) => (
            <div
              key={`dot-${node.event.id}`}
              className="pointer-events-none absolute z-40 -translate-x-1/2"
              style={{ left: yearToX(node.t, pxPerYear), top: axisY - 7 }}
              aria-hidden
            >
              <div
                className={`h-3.5 w-3.5 rounded-full border-2 border-fs-bg shadow-sm ring-1 ${
                  selected?.event.id === node.event.id
                    ? "bg-fs-accent-text ring-fs-accent"
                    : "bg-fs-accent ring-fs-accent/30"
                }`}
              />
            </div>
          ))}
        </div>

        {clusterList ? (
          <div
            className="absolute inset-x-0 bottom-3 z-[57] flex justify-center px-4"
            data-no-drag
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="max-h-[60%] w-full max-w-xl overflow-hidden rounded-lg border border-fs-border bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-fs-border px-3 py-2">
                <span className="text-xs font-semibold text-fs-text">
                  同期 {clusterList.length} 个事件
                </span>
                <button
                  type="button"
                  onClick={() => setClusterList(null)}
                  className="rounded px-2 text-sm text-fs-muted hover:bg-fs-elevated"
                  aria-label="关闭"
                >
                  ×
                </button>
              </div>
              <ul className="max-h-72 divide-y divide-fs-border overflow-y-auto">
                {clusterList.map((n) => (
                  <li key={n.event.id}>
                    <button
                      type="button"
                      onClick={() => selectNode(n)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-fs-elevated"
                    >
                      <time className="shrink-0 text-[10px] tabular-nums text-fs-muted">
                        {formatEventOccurredAt(n.event)}
                      </time>
                      <EventImportanceBadge importance={n.event.importance} />
                      <span className="line-clamp-1 text-xs text-fs-text">
                        {n.event.title ?? "未命名事件"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : selected ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[55] flex justify-center px-4">
            <div className="pointer-events-auto max-w-xl rounded-lg border border-fs-border bg-white/95 px-3 py-1.5 text-[11px] text-fs-secondary shadow-sm backdrop-blur">
              <span className="font-medium text-fs-text">{selected.event.title}</span>
              {selected.eraTag ? (
                <>
                  <span className="mx-2 text-fs-muted">·</span>
                  <span>{selected.eraTag}</span>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <EventDetailDrawer event={drawerEvent} onClose={() => setDrawerEvent(null)} />
    </div>
  );
}
