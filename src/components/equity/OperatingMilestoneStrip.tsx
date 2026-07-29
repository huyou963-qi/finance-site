"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CHANNEL_LABELS,
  filterMilestones,
  isoDateToUnixSec,
  loadDemoMilestones,
  loadStoredMilestones,
  parseMilestoneIngestJson,
  saveStoredMilestones,
  type CompanyMilestone,
  type MilestoneFilter,
  MILESTONE_FILTER_LABELS,
} from "@/lib/equity/companyMilestones";

const KIND_DOT: Record<CompanyMilestone["kind"], string> = {
  product: "bg-emerald-500",
  capacity: "bg-orange-400",
  policy: "bg-sky-500",
  other: "bg-slate-400",
};

const TEMPLATE_BASE = "/templates/company-milestone";

export function OperatingMilestoneStrip({
  symbol,
  rangeFromSec = null,
  rangeToSec = null,
  height = 240,
}: {
  symbol: string;
  /** K 线可视区间起止（unix 秒）；有值时只展示区间内里程碑 */
  rangeFromSec?: number | null;
  rangeToSec?: number | null;
  height?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<CompanyMilestone[]>([]);
  const [filter, setFilter] = useState<MilestoneFilter>("all");
  const [onlyHigh, setOnlyHigh] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sym = symbol.trim().toUpperCase();

  useEffect(() => {
    if (!sym) {
      setItems([]);
      return;
    }
    const stored = loadStoredMilestones(sym);
    setItems(stored);
    setSelectedId(stored[0]?.id ?? null);
  }, [sym]);

  const visible = useMemo(() => {
    let list = filterMilestones(items, filter, onlyHigh ? "HIGH" : "MEDIUM");
    if (rangeFromSec != null && rangeToSec != null) {
      const lo = Math.min(rangeFromSec, rangeToSec);
      const hi = Math.max(rangeFromSec, rangeToSec);
      list = list.filter((m) => {
        const t = isoDateToUnixSec(m.occurredAt);
        return t >= lo && t <= hi;
      });
    }
    return list;
  }, [items, filter, onlyHigh, rangeFromSec, rangeToSec]);

  const selected = visible.find((m) => m.id === selectedId) ?? visible[0] ?? null;

  const applyItems = useCallback(
    (next: CompanyMilestone[]) => {
      setItems(next);
      if (sym) saveStoredMilestones(sym, next);
      setSelectedId(next[0]?.id ?? null);
    },
    [sym],
  );

  const loadSample = useCallback(() => {
    if (!sym) return;
    applyItems(loadDemoMilestones("TSLA"));
  }, [sym, applyItems]);

  const onFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      try {
        const text = await file.text();
        const raw = JSON.parse(text) as unknown;
        const { milestones, errors } = parseMilestoneIngestJson(raw);
        if (errors.length && milestones.length === 0) return;
        applyItems(milestones);
      } catch {
        /* ignore invalid JSON */
      }
      if (fileRef.current) fileRef.current.value = "";
    },
    [applyItems],
  );

  const onSelect = useCallback((m: CompanyMilestone) => {
    setSelectedId(m.id);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const root = scrollRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-mid="${selectedId.replace(/"/g, "")}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedId]);

  const minDate = visible[0]?.occurredAt;
  const maxDate = visible[visible.length - 1]?.occurredAt;

  return (
    <div
      className="flex shrink-0 flex-col border-t border-fs-border bg-fs-bg"
      style={{ height }}
    >
      <div className="flex flex-wrap items-center gap-1.5 border-b border-fs-border px-2 py-1.5">
        <span className="text-[11px] font-medium text-fs-text">经营时间轴</span>
        <span className="text-[10px] text-fs-muted">{sym || "未选标的"}</span>
        {(Object.keys(MILESTONE_FILTER_LABELS) as MilestoneFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              filter === f
                ? "bg-fs-accent-soft text-fs-accent-text"
                : "text-fs-muted hover:bg-fs-elevated"
            }`}
          >
            {MILESTONE_FILTER_LABELS[f]}
          </button>
        ))}
        <label className="ml-1 flex cursor-pointer items-center gap-1 text-[10px] text-fs-muted">
          <input
            type="checkbox"
            checked={onlyHigh}
            onChange={(e) => setOnlyHigh(e.target.checked)}
            className="h-3 w-3"
          />
          仅 HIGH+
        </label>
        <span className="text-[10px] tabular-nums text-fs-muted">{visible.length} 条</span>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <a
            href={`${TEMPLATE_BASE}/README.md`}
            download
            className="rounded border border-fs-border px-1.5 py-0.5 text-[10px] text-fs-secondary hover:bg-fs-elevated"
          >
            说明
          </a>
          <a
            href={`${TEMPLATE_BASE}/ingest-output.schema.json`}
            download
            className="rounded border border-fs-border px-1.5 py-0.5 text-[10px] text-fs-secondary hover:bg-fs-elevated"
          >
            Schema
          </a>
          <a
            href={`${TEMPLATE_BASE}/example-TSLA.json`}
            download
            className="rounded border border-fs-border px-1.5 py-0.5 text-[10px] text-fs-secondary hover:bg-fs-elevated"
          >
            示例 JSON
          </a>
          <a
            href={`${TEMPLATE_BASE}/SKILL.md`}
            download
            className="rounded border border-fs-border px-1.5 py-0.5 text-[10px] text-fs-secondary hover:bg-fs-elevated"
          >
            Skill
          </a>
          <button
            type="button"
            onClick={loadSample}
            className="rounded bg-fs-accent-soft px-1.5 py-0.5 text-[10px] text-fs-accent-text hover:opacity-90"
          >
            载入 TSLA 范本
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded border border-fs-accent/40 bg-white px-1.5 py-0.5 text-[10px] text-fs-accent-text hover:bg-fs-accent-soft"
          >
            导入 JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {visible.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-fs-muted">
            {!sym
              ? "请先在上方选择股票标的。"
              : items.length > 0
                ? "当前 K 线可视区间内无经营事件，可拖动上方时间范围控件扩大区间。"
                : "暂无经营事件。下载 Skill/Schema，用自己的 AI 生成 JSON 后点「导入 JSON」，或先「载入 TSLA 范本」预览。"}
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="absolute inset-0 overflow-x-auto overflow-y-hidden px-3 py-2"
          >
            <div className="relative min-w-max" style={{ minWidth: Math.max(640, visible.length * 120) }}>
              <div className="mb-1 flex justify-between text-[9px] tabular-nums text-fs-muted">
                <span>{minDate}</span>
                <span>{maxDate}</span>
              </div>
              <div className="relative mx-2 h-px bg-fs-border">
                <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-fs-border" />
              </div>
              <ol className="relative mt-1 flex items-start gap-2 pt-3">
                {visible.map((m) => {
                  const active = m.id === (selected?.id ?? selectedId);
                  return (
                    <li key={m.id} data-mid={m.id} className="relative w-[112px] shrink-0">
                      <button
                        type="button"
                        onClick={() => onSelect(m)}
                        className={`flex w-full flex-col items-center text-left ${
                          active ? "opacity-100" : "opacity-85 hover:opacity-100"
                        }`}
                      >
                        <span
                          className={`mb-1 h-2.5 w-2.5 rounded-full ring-2 ${
                            active ? "ring-fs-text" : "ring-white"
                          } ${KIND_DOT[m.kind]}`}
                        />
                        <span className="text-[9px] tabular-nums text-fs-muted">
                          {m.occurredAt.slice(0, 7)}
                        </span>
                        <span
                          className={`mt-0.5 line-clamp-2 w-full rounded border px-1 py-0.5 text-center text-[10px] leading-snug ${
                            active
                              ? "border-fs-accent bg-fs-accent-soft font-medium text-fs-text"
                              : "border-fs-border bg-fs-elevated text-fs-secondary"
                          }`}
                        >
                          {m.markerLabel}
                        </span>
                        <span className="mt-0.5 line-clamp-2 w-full text-center text-[9px] text-fs-muted">
                          {m.title}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        )}
      </div>

      {selected ? (
        <div className="shrink-0 border-t border-fs-border bg-fs-elevated/50 px-2 py-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[10px] tabular-nums text-fs-muted">{selected.occurredAt}</span>
            <span className="text-[10px] text-fs-muted">{selected.typeLabel}</span>
            <span className="text-[11px] font-medium text-fs-text">{selected.title}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-fs-secondary">
            {selected.impact.summary}
          </p>
          {selected.impact.channels?.length ? (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {selected.impact.channels.map((c) => (
                <span
                  key={c}
                  className="rounded bg-white px-1 text-[9px] text-fs-muted ring-1 ring-fs-border"
                >
                  {CHANNEL_LABELS[c] ?? c}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
