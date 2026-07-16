"use client";

import { useEffect, useState } from "react";
import type {
  EventDatePrecision,
  EventImportance,
  EventScope,
  MarketEventDto,
} from "@/lib/data/marketEvents";
import {
  EVENT_IMPORTANCE_LABELS,
  EVENT_INDUSTRY_SUGGESTIONS,
  EVENT_SCOPE_LABELS,
  EVENT_SCOPES,
  EVENT_TYPE_SUGGESTIONS,
} from "@/lib/data/marketEvents";
import { EVENT_TYPE_LABELS, type EventTypeCode } from "@/lib/data/eventTaxonomy";
import { MACRO_COUNTRIES } from "@/lib/data/macroCatalog";
import { TagInput } from "@/components/events/TagInput";

export type EventFormValues = {
  title: string;
  content: string;
  occurredAt: string;
  occurredTime: string;
  datePrecision: EventDatePrecision;
  importance: EventImportance;
  eventType: string;
  scope: EventScope;
  countries: string[];
  industries: string[];
  assets: string[];
  macroKeys: string[];
  persons: string[];
  institutions: string[];
  tags: string[];
  markerLabel: string;
  sourceUrl: string;
};

export function emptyEventForm(defaultDate?: string): EventFormValues {
  return {
    title: "",
    content: "",
    occurredAt: defaultDate ?? new Date().toISOString().slice(0, 10),
    occurredTime: "12:00",
    datePrecision: "DATE",
    importance: "MEDIUM",
    eventType: "",
    scope: "CROSS",
    countries: [],
    industries: [],
    assets: [],
    macroKeys: [],
    persons: [],
    institutions: [],
    tags: [],
    markerLabel: "",
    sourceUrl: "",
  };
}

export function eventToFormValues(event: MarketEventDto): EventFormValues {
  const d = new Date(event.occurredAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    title: event.title ?? "",
    content: event.content,
    occurredAt: event.occurredAt.slice(0, 10),
    occurredTime: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
    datePrecision: event.datePrecision,
    importance: event.importance,
    eventType: event.eventType ?? "",
    scope: event.scope ?? "CROSS",
    countries: event.countries,
    industries: event.industries,
    assets: event.assets,
    macroKeys: event.macroKeys,
    persons: event.persons ?? [],
    institutions: event.institutions ?? [],
    tags: event.tags ?? [],
    markerLabel: event.markerLabel ?? "",
    sourceUrl: event.sourceUrl ?? "",
  };
}

export function formValuesToPayload(form: EventFormValues) {
  const occurredAt =
    form.datePrecision === "DATETIME"
      ? `${form.occurredAt}T${form.occurredTime || "12:00"}:00.000Z`
      : form.occurredAt;
  return {
    title: form.title.trim() || null,
    content: form.content.trim(),
    occurredAt,
    datePrecision: form.datePrecision,
    importance: form.importance,
    eventType: form.eventType.trim() || null,
    scope: form.scope,
    countries: form.countries,
    industries: form.industries,
    assets: form.assets,
    macroKeys: form.macroKeys,
    persons: form.persons,
    institutions: form.institutions,
    tags: form.tags,
    markerLabel: form.markerLabel.trim() || null,
    sourceUrl: form.sourceUrl.trim() || null,
    sourceKind: "manual",
  };
}

const COUNTRY_SUGGESTIONS = MACRO_COUNTRIES.map((c) => c.code);

function typeDisplay(t: string): string {
  if (t in EVENT_TYPE_LABELS) return `${EVENT_TYPE_LABELS[t as EventTypeCode]} (${t})`;
  return t;
}

export function EventFormModal({
  open,
  title,
  initial,
  editId,
  onClose,
  onSaved,
}: {
  open: boolean;
  title: string;
  initial: EventFormValues;
  editId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initial);
      setError(null);
    }
  }, [open, initial]);

  if (!open) return null;

  const patch = (p: Partial<EventFormValues>) => setForm((prev) => ({ ...prev, ...p }));

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = formValuesToPayload(form);
      const url = editId ? `/api/events/${editId}` : "/api/events";
      const method = editId ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "保存失败");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-fs-border bg-fs-bg shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-fs-border px-4 py-2">
          <h2 className="text-sm font-semibold text-fs-text">{title}</h2>
          <button type="button" onClick={onClose} className="text-fs-muted hover:text-fs-text">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3 text-[11px]">
          <p className="text-[10px] text-fs-muted">
            批量补录请用 AI Skill（market-event-ingest）；本表单用于纠错与少量补漏。
          </p>
          <label className="block text-fs-muted">
            标题（可选）
            <input
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
              className="mt-0.5 w-full rounded border border-fs-border bg-fs-elevated px-2 py-1 text-fs-text"
            />
          </label>
          <label className="block text-fs-muted">
            事件内容 *
            <textarea
              value={form.content}
              onChange={(e) => patch({ content: e.target.value })}
              rows={4}
              className="mt-0.5 w-full rounded border border-fs-border bg-fs-elevated px-2 py-1 text-fs-text"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-fs-muted">
              时间精度
              <select
                value={form.datePrecision}
                onChange={(e) =>
                  patch({ datePrecision: e.target.value as EventDatePrecision })
                }
                className="mt-0.5 w-full rounded border border-fs-border bg-fs-elevated px-2 py-1 text-fs-text"
              >
                <option value="DATE">仅日期</option>
                <option value="DATETIME">日期+时间</option>
              </select>
            </label>
            <label className="block text-fs-muted">
              重要性
              <select
                value={form.importance}
                onChange={(e) =>
                  patch({ importance: e.target.value as EventImportance })
                }
                className="mt-0.5 w-full rounded border border-fs-border bg-fs-elevated px-2 py-1 text-fs-text"
              >
                {(Object.keys(EVENT_IMPORTANCE_LABELS) as EventImportance[]).map((k) => (
                  <option key={k} value={k}>
                    {EVENT_IMPORTANCE_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-fs-muted">
              发生日期 *
              <input
                type="date"
                value={form.occurredAt}
                onChange={(e) => patch({ occurredAt: e.target.value })}
                className="mt-0.5 w-full rounded border border-fs-border bg-fs-elevated px-2 py-1 text-fs-text"
              />
            </label>
            {form.datePrecision === "DATETIME" ? (
              <label className="block text-fs-muted">
                时间 (UTC)
                <input
                  type="time"
                  value={form.occurredTime}
                  onChange={(e) => patch({ occurredTime: e.target.value })}
                  className="mt-0.5 w-full rounded border border-fs-border bg-fs-elevated px-2 py-1 text-fs-text"
                />
              </label>
            ) : (
              <label className="block text-fs-muted">
                影响范围
                <select
                  value={form.scope}
                  onChange={(e) => patch({ scope: e.target.value as EventScope })}
                  className="mt-0.5 w-full rounded border border-fs-border bg-fs-elevated px-2 py-1 text-fs-text"
                >
                  {EVENT_SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {EVENT_SCOPE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-fs-muted">
              事件类型
              <select
                value={form.eventType}
                onChange={(e) => patch({ eventType: e.target.value })}
                className="mt-0.5 w-full rounded border border-fs-border bg-fs-elevated px-2 py-1 text-fs-text"
              >
                <option value="">—</option>
                {EVENT_TYPE_SUGGESTIONS.map((t) => (
                  <option key={t} value={t}>
                    {typeDisplay(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-fs-muted">
              图上缩略字
              <input
                value={form.markerLabel}
                onChange={(e) => patch({ markerLabel: e.target.value.slice(0, 16) })}
                placeholder="如 降息、财报"
                className="mt-0.5 w-full rounded border border-fs-border bg-fs-elevated px-2 py-1 text-fs-text"
              />
            </label>
          </div>
          {form.datePrecision === "DATETIME" ? (
            <label className="block text-fs-muted">
              影响范围
              <select
                value={form.scope}
                onChange={(e) => patch({ scope: e.target.value as EventScope })}
                className="mt-0.5 w-full rounded border border-fs-border bg-fs-elevated px-2 py-1 text-fs-text"
              >
                {EVENT_SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {EVENT_SCOPE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <TagInput
            label="国家标签"
            values={form.countries}
            onChange={(countries) => patch({ countries })}
            placeholder="如 CN、US，回车添加"
            suggestions={COUNTRY_SUGGESTIONS}
            uppercase
          />
          <TagInput
            label="行业标签（GICS）"
            values={form.industries}
            onChange={(industries) => patch({ industries })}
            suggestions={[...EVENT_INDUSTRY_SUGGESTIONS]}
          />
          <TagInput
            label="资产标签"
            values={form.assets}
            onChange={(assets) => patch({ assets })}
            placeholder="如 AAPL、000300.SH"
            uppercase
          />
          <TagInput
            label="人物"
            values={form.persons}
            onChange={(persons) => patch({ persons })}
            placeholder="Powell…"
          />
          <TagInput
            label="机构"
            values={form.institutions}
            onChange={(institutions) => patch({ institutions })}
            placeholder="Fed…"
          />
          <TagInput
            label="自由标签"
            values={form.tags}
            onChange={(tags) => patch({ tags })}
            placeholder="关税、AI…"
          />
          <TagInput
            label="宏观指标 key（可选）"
            values={form.macroKeys}
            onChange={(macroKeys) => patch({ macroKeys })}
            placeholder="如 fred:CPIAUCSL"
          />
          <label className="block text-fs-muted">
            来源链接
            <input
              value={form.sourceUrl}
              onChange={(e) => patch({ sourceUrl: e.target.value })}
              className="mt-0.5 w-full rounded border border-fs-border bg-fs-elevated px-2 py-1 text-fs-text"
            />
          </label>
          {error ? <p className="text-rose-300">{error}</p> : null}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-fs-border px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-fs-border px-3 py-1 text-fs-secondary hover:bg-fs-elevated"
          >
            取消
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="rounded border border-fs-accent/40 bg-fs-accent-soft/50 px-3 py-1 text-fs-accent-text hover:border-fs-accent disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
