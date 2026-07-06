"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import { buildEventTimeline } from "@/lib/data/marketEventTimeline";
import { EventDetailDrawer } from "@/components/events/EventDetailDrawer";
import { EventTimelineCard } from "@/components/events/horizontal-timeline/EventTimelineCard";
import { TimelineFilterPopover } from "@/components/events/horizontal-timeline/TimelineFilterPopover";
import {
  applyTimelineFilters,
  DEFAULT_TIMELINE_FILTERS,
  type TimelineFilterState,
} from "@/components/events/horizontal-timeline/timelineFilters";
import {
  BASE_PX_PER_YEAR,
  buildEraBands,
  buildTimelineEventNodes,
  contentWidth,
  tickYears,
  type TimelineEventNode,
} from "@/components/events/horizontal-timeline/timelineLayout";

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.8;
const AXIS_GAP = 48;
const CARD_HALF_W = 100;
const MIN_CANVAS_H = 480;

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
  const [viewportH, setViewportH] = useState(MIN_CANVAS_H);
  const [filters, setFilters] = useState<TimelineFilterState>(DEFAULT_TIMELINE_FILTERS);

  const filteredEvents = useMemo(
    () => applyTimelineFilters(events, filters),
    [events, filters],
  );

  const canvasH = Math.max(MIN_CANVAS_H, viewportH);
  const eraHeaderH = Math.min(100, Math.max(72, Math.round(canvasH * 0.13)));
  const axisY = Math.round(canvasH * 0.5);

  const pxPerYear = BASE_PX_PER_YEAR * zoom;
  const width = contentWidth(pxPerYear);

  const timelineModel = useMemo(() => buildEventTimeline(filteredEvents), [filteredEvents]);
  const eraBands = useMemo(() => buildEraBands(timelineModel.groups), [timelineModel.groups]);
  const nodes = useMemo(
    () => buildTimelineEventNodes(filteredEvents, pxPerYear, eraBands),
    [filteredEvents, pxPerYear, eraBands],
  );
  const ticks = useMemo(() => tickYears(pxPerYear), [pxPerYear]);

  useEffect(() => {
    if (selected && !nodes.some((n) => n.event.id === selected.event.id)) {
      setSelected(null);
    }
  }, [nodes, selected]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panXRef.current = panX;
  }, [panX]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** 滚轮缩放（以光标位置为锚点）；需 passive: false 阻止页面滚动 */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const oldZoom = zoomRef.current;
      const step = e.deltaY > 0 ? -0.07 : 0.07;
      const newZoom = clamp(oldZoom + step, MIN_ZOOM, MAX_ZOOM);
      if (newZoom === oldZoom) return;

      const oldPan = panXRef.current;
      const anchorX = mouseX - oldPan;
      const newPan = mouseX - anchorX * (newZoom / oldZoom);

      zoomRef.current = newZoom;
      panXRef.current = newPan;
      setZoom(newZoom);
      setPanX(newPan);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={viewportRef}
        className={`relative min-h-0 flex-1 overflow-hidden bg-fs-bg select-none ${
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
                left: (band.fromYear - 1776) * pxPerYear,
                width: (band.toYear - band.fromYear) * pxPerYear,
                height: canvasH,
                background: band.color,
              }}
            />
          ))}

          {/* 事件卡（限制在时代介绍条下方） */}
          {nodes.map((node, idx) => {
            const stagger =
              idx > 0 && Math.abs(node.x - nodes[idx - 1].x) < 190 ? (idx % 3) * 20 : 0;
            const isAbove = node.lane === "above";

            if (isAbove) {
              const maxCardH = axisY - AXIS_GAP - eraHeaderH - stagger;
              return (
                <div
                  key={node.event.id}
                  className="absolute z-10 overflow-hidden"
                  style={{
                    left: node.x - CARD_HALF_W,
                    bottom: canvasH - (axisY - AXIS_GAP),
                    maxHeight: maxCardH,
                    width: CARD_HALF_W * 2,
                  }}
                >
                  <EventTimelineCard
                    node={node}
                    scale={clamp(zoom, 0.6, 1.2)}
                    selected={selected?.event.id === node.event.id}
                    stemLength={12}
                    onSelect={() => {
                      setSelected(node);
                      setDrawerEvent(node.event);
                    }}
                  />
                </div>
              );
            }

            return (
              <div
                key={node.event.id}
                className="absolute z-10"
                style={{
                  left: node.x - CARD_HALF_W,
                  top: axisY + AXIS_GAP + stagger,
                }}
              >
                <EventTimelineCard
                  node={node}
                  scale={clamp(zoom, 0.6, 1.2)}
                  selected={selected?.event.id === node.event.id}
                  stemLength={AXIS_GAP - 8 + stagger}
                  onSelect={() => {
                    setSelected(node);
                    setDrawerEvent(node.event);
                  }}
                />
              </div>
            );
          })}

          {/* 时代介绍条（置顶不透明，不被事件卡遮挡） */}
          {eraBands.map((band) => (
            <div
              key={`era-header-${band.id}`}
              className="absolute top-0 z-50 border-b border-fs-border/60 px-3 py-2.5 shadow-sm"
              style={{
                left: (band.fromYear - 1776) * pxPerYear,
                width: (band.toYear - band.fromYear) * pxPerYear,
                height: eraHeaderH,
                backgroundColor: band.headerBg,
              }}
            >
              <p className="text-[10px] font-medium uppercase tracking-widest text-fs-muted">
                {band.fromYear}–{band.toYear >= 2020 ? "今" : band.toYear}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-fs-text">{band.tag}</p>
              {band.summary && (band.toYear - band.fromYear) * pxPerYear > 200 ? (
                <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-fs-secondary">
                  {band.summary}
                </p>
              ) : null}
            </div>
          ))}

          {/* 主轴轨道 */}
          <div
            className="pointer-events-none absolute inset-x-0 z-30"
            style={{ top: axisY - 5, height: 10 }}
            aria-hidden
          >
            <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-fs-border" />
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-fs-accent" />
          </div>

          {/* 刻度与年份 */}
          {ticks.map((t) => (
            <div
              key={t.year}
              className="pointer-events-none absolute z-30 flex flex-col items-center"
              style={{
                left: t.x,
                top: t.major ? axisY + 14 : axisY + 10,
              }}
            >
              <div
                className={`rounded-full ${
                  t.major ? "h-2 w-2 bg-fs-accent" : "h-1.5 w-1.5 bg-fs-muted/60"
                }`}
              />
              {t.major || pxPerYear > 12 ? (
                <span
                  className={`mt-1.5 tabular-nums ${
                    t.major ? "text-sm font-semibold text-fs-text" : "text-xs text-fs-secondary"
                  }`}
                >
                  {t.year}
                </span>
              ) : null}
            </div>
          ))}

          {/* 事件锚点 */}
          {nodes.map((node) => (
            <div
              key={`dot-${node.event.id}`}
              className="pointer-events-none absolute z-40 -translate-x-1/2"
              style={{ left: node.x, top: axisY - 7 }}
              aria-hidden
            >
              <div className="h-3.5 w-3.5 rounded-full border-2 border-fs-bg bg-fs-accent shadow-sm ring-1 ring-fs-accent/30" />
            </div>
          ))}
        </div>

        {selected ? (
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
