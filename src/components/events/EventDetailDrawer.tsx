"use client";

import { useEffect, useRef } from "react";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import { formatEventOccurredAt } from "@/lib/data/marketEvents";
import { EventImportanceBadge } from "@/components/events/EventImportanceBadge";
import { MacroEventSurpriseSummary, MacroSurpriseEvidence, MacroReleaseComponentsEvidence } from "@/components/events/MacroSurpriseEvidence";
import {
  eventDisplayContent,
  parseEventSections,
} from "@/lib/data/eventContentDisplay";

function MetaTag({ children }: { children: string }) {
  return (
    <span className="rounded bg-fs-elevated px-1.5 py-0.5 text-[10px] text-fs-muted ring-1 ring-fs-border/70">
      {children}
    </span>
  );
}

export type EventDetailDrawerProps = {
  event: MarketEventDto | null;
  onClose: () => void;
  presentation?: "modal" | "sidebar";
};

export function EventDetailDrawer({ event, onClose, presentation = "modal" }: EventDetailDrawerProps) {
  const docked = presentation === "sidebar";
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (docked) scrollRef.current?.scrollTo({ top: 0 }); }, [docked, event?.id]);
  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [event, onClose]);

  if (!event) return null;

  const sections = parseEventSections(event.content);
  const fallback = eventDisplayContent(event.content);
  const tags = [
    ...event.countries,
    ...event.industries.filter((t) => t !== "时代阶段"),
    ...event.assets,
  ];

  const panel = (
      <aside
        id={docked ? "markets-event-detail-panel" : undefined}
        role={docked ? "complementary" : "dialog"}
        aria-label={docked ? "事件详情" : undefined}
        aria-modal={docked ? undefined : true}
        aria-labelledby={docked ? undefined : "event-detail-title"}
        className={docked ? "flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden bg-white [overflow-wrap:anywhere]" : "relative flex h-full w-full max-w-md flex-col border-l border-fs-border bg-fs-bg shadow-2xl max-md:h-[88dvh] max-md:max-w-none max-md:overflow-hidden max-md:rounded-t-2xl max-md:border-l-0"}
      >
        <div ref={scrollRef} className={docked ? "min-h-0 flex-1 overflow-y-auto px-3 py-3 md:px-4 md:py-4" : "contents"}>
        <header className={docked ? "border-b border-fs-border pb-3" : "shrink-0 border-b border-fs-border px-4 py-3"}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wide text-fs-muted">事件详情</p>
              <h2 id="event-detail-title" className={`mt-1 font-semibold text-fs-text ${docked ? "text-xs leading-5" : "text-base"}`}>
                {event.title ?? "未命名事件"}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded border border-fs-border px-2 py-1 text-xs text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
            >
              关闭
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <time className="text-xs tabular-nums text-cyan-400/95">
              {formatEventOccurredAt(event)}
            </time>
            <EventImportanceBadge importance={event.importance} />
            {event.eventType ? <MetaTag>{event.eventType}</MetaTag> : null}
          </div>
          {tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.map((t) => (
                <MetaTag key={t}>{t}</MetaTag>
              ))}
            </div>
          ) : null}
          {event.macroKeys.length > 0 ? (
            <div className="mt-2">
              <p className="text-[10px] text-fs-muted">关联宏观指标</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {event.macroKeys.map((k) => (
                  <MetaTag key={k}>{k}</MetaTag>
                ))}
              </div>
            </div>
          ) : null}
        </header>

        <div className={docked ? "py-3" : "min-h-0 flex-1 overflow-y-auto px-4 py-4"}>
          {event.eventType === "macro.release" && <div className="mb-4"><MacroEventSurpriseSummary payload={event.payload} /><MacroSurpriseEvidence payload={event.payload} /></div>}
          {event.eventType === "macro.release" && <div className="mb-4"><MacroReleaseComponentsEvidence payload={event.payload} /></div>}
          {sections.length > 0 ? (
            <div className="space-y-5">
              {sections.map((sec) => (
                <section key={sec.title}>
                  <h3 className="border-b border-fs-border/60 pb-1 text-xs font-semibold text-fs-text">
                    {sec.title}
                  </h3>
                  <p className={`mt-2 whitespace-pre-wrap leading-relaxed text-fs-secondary ${docked ? "text-xs" : "text-sm"}`}>
                    {sec.body}
                  </p>
                </section>
              ))}
            </div>
          ) : (
            <p className={`whitespace-pre-wrap leading-relaxed text-fs-secondary ${docked ? "text-xs" : "text-sm"}`}>
              {fallback}
            </p>
          )}
        </div>

        <footer className={docked ? "border-t border-fs-border py-3" : "shrink-0 border-t border-fs-border px-4 py-3"}>
          {event.sourceUrl ? (
            <a
              href={event.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded border border-fs-accent/30 bg-fs-accent-soft px-3 py-1.5 text-xs font-medium text-fs-accent-text hover:border-fs-accent"
            >
              延伸阅读（Wikipedia 等）↗
            </a>
          ) : (
            <p className="text-[11px] text-fs-muted">暂无外部来源链接</p>
          )}
          {event.createdByUsername ? (
            <p className="mt-2 text-[10px] text-fs-muted">录入：{event.createdByUsername}</p>
          ) : null}
        </footer>
        </div>
      </aside>
  );
  return docked ? panel : (
    <div className="fixed inset-0 z-[10000] flex justify-end max-md:flex-col">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="关闭详情" onClick={onClose} />
      {panel}
    </div>
  );
}
