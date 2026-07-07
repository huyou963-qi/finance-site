"use client";

import { useMemo, useState } from "react";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import { EventListRow } from "@/components/events/EventListRow";
import {
  buildEventTimeline,
  cyclePhaseLabel,
  formatEraDateRange,
  type TimelineEraGroup,
} from "@/lib/data/marketEventTimeline";
import {
  eventDisplayContent,
  eraPreviewSummary,
} from "@/lib/data/eventContentDisplay";

export type EventTimelineViewProps = {
  events: MarketEventDto[];
  compact?: boolean;
  isAdmin: boolean;
  highlightedId?: string | null;
  onEdit: (e: MarketEventDto) => void;
  onDelete: (id: string) => void;
  rowRef?: (id: string, el: HTMLLIElement | null) => void;
};

function EraSection({
  group,
  compact,
  isAdmin,
  highlightedId,
  onEdit,
  onDelete,
  rowRef,
}: {
  group: TimelineEraGroup;
  compact?: boolean;
  isAdmin: boolean;
  highlightedId?: string | null;
  onEdit: (e: MarketEventDto) => void;
  onDelete: (id: string) => void;
  rowRef?: (id: string, el: HTMLLIElement | null) => void;
}) {
  const [expanded, setExpanded] = useState(group.defaultExpanded);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const { era, meta, children } = group;
  const dateRange = formatEraDateRange(meta, era);
  const phase = cyclePhaseLabel(meta.eraPhase);
  const tag = meta.eraTag ?? era.industries.find((t) => t !== "时代阶段") ?? "";
  const fullSummary = eventDisplayContent(era.content);

  return (
    <li className="relative pl-4">
      <span
        className="absolute left-0 top-3 h-[calc(100%-0.5rem)] w-px border-l border-dotted border-fs-border/80"
        aria-hidden
      />
      <span
        className="absolute left-[-3px] top-3 h-1.5 w-1.5 rounded-full bg-cyan-500/80 ring-2 ring-fs-bg"
        aria-hidden
      />

      <div className="rounded-md border border-fs-border/90 bg-fs-elevated/45">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-start gap-2 px-2 py-2 text-left hover:bg-fs-elevated"
          aria-expanded={expanded}
        >
          <span className="mt-0.5 shrink-0 text-[10px] text-fs-muted">{expanded ? "▾" : "▸"}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-[10px] tabular-nums text-cyan-400/95">{dateRange}</span>
              {tag ? (
                <span className="rounded bg-cyan-950/50 px-1.5 py-0 text-[9px] text-cyan-200/90">
                  {tag}
                </span>
              ) : null}
              {phase ? (
                <span className="text-[9px] text-fs-muted">{phase}</span>
              ) : null}
              <span className="text-[10px] text-fs-muted">
                {children.length} 条事件
              </span>
              {era.sourceUrl ? (
                <a
                  href={era.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-cyan-500/90 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  link
                </a>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] font-medium leading-snug text-fs-text">
              {era.title ?? tag}
            </p>
            {!expanded ? (
              <p className="mt-1 text-[10px] leading-relaxed text-fs-muted">
                {eraPreviewSummary(era.content)}
              </p>
            ) : null}
          </div>
        </button>

        {expanded ? (
          <div className="border-t border-fs-border px-2 pb-2 pt-1.5">
            <button
              type="button"
              onClick={() => setSummaryOpen((v) => !v)}
              className="mb-1.5 text-[10px] text-fs-muted hover:text-fs-secondary"
            >
              {summaryOpen ? "收起阶段分析 ▴" : "展开阶段分析 ▾"}
            </button>
            {summaryOpen ? (
              <pre className="mb-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded border border-fs-border bg-fs-bg/60 p-2 text-[10px] leading-relaxed text-fs-secondary">
                {fullSummary}
              </pre>
            ) : null}
            <ul className="space-y-1.5">
              {children.map((ev) => (
                <EventListRow
                  key={ev.id}
                  event={ev}
                  compact={compact}
                  nested
                  isAdmin={isAdmin}
                  highlighted={highlightedId === ev.id}
                  rowRef={(el) => rowRef?.(ev.id, el)}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function EventTimelineView({
  events,
  compact,
  isAdmin,
  highlightedId,
  onEdit,
  onDelete,
  rowRef,
}: EventTimelineViewProps) {
  const model = useMemo(() => buildEventTimeline(events), [events]);

  if (!model.hasEraStructure) {
    return (
      <ul className="space-y-1.5">
        {events.map((ev) => (
          <EventListRow
            key={ev.id}
            event={ev}
            compact={compact}
            isAdmin={isAdmin}
            highlighted={highlightedId === ev.id}
            rowRef={(el) => rowRef?.(ev.id, el)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ul>
    );
  }

  return (
    <ul className="space-y-3">
      {model.groups.map((group) => (
        <EraSection
          key={group.era.id}
          group={group}
          compact={compact}
          isAdmin={isAdmin}
          highlightedId={highlightedId}
          onEdit={onEdit}
          onDelete={onDelete}
          rowRef={rowRef}
        />
      ))}
      {model.orphans.length > 0 ? (
        <li className="pt-2">
          <p className="mb-1.5 px-1 text-[10px] font-medium text-fs-muted">未归类事件</p>
          <ul className="space-y-1.5">
            {model.orphans.map((ev) => (
              <EventListRow
                key={ev.id}
                event={ev}
                compact={compact}
                isAdmin={isAdmin}
                highlighted={highlightedId === ev.id}
                rowRef={(el) => rowRef?.(ev.id, el)}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </ul>
        </li>
      ) : null}
    </ul>
  );
}

/** 按筛选结果裁剪时间线：阶段在自身或子事件匹配时保留 */
export function filterTimelineGroups(
  model: ReturnType<typeof buildEventTimeline>,
  matchEvent: (ev: MarketEventDto) => boolean,
): ReturnType<typeof buildEventTimeline> {
  if (!model.hasEraStructure) {
    return {
      ...model,
      orphans: model.orphans.filter(matchEvent),
    };
  }

  const groups: TimelineEraGroup[] = [];
  for (const g of model.groups) {
    const children = g.children.filter(matchEvent);
    const eraOk = matchEvent(g.era);
    if (!eraOk && children.length === 0) continue;
    groups.push({ ...g, children });
  }

  return {
    groups,
    orphans: model.orphans.filter(matchEvent),
    hasEraStructure: true,
  };
}

export function timelineVisibleEvents(
  model: ReturnType<typeof buildEventTimeline>,
): MarketEventDto[] {
  const out: MarketEventDto[] = [];
  for (const g of model.groups) {
    out.push(g.era, ...g.children);
  }
  out.push(...model.orphans);
  return out;
}
