"use client";

import { useEffect, useState } from "react";
import type { EventDatePrecision, EventImportance, MarketEventDto } from "@/lib/data/marketEvents";
import {
  EVENT_IMPORTANCE_LABELS,
  EVENT_INDUSTRY_SUGGESTIONS,
  EVENT_TYPE_SUGGESTIONS,
} from "@/lib/data/marketEvents";
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
  countries: string[];
  industries: string[];
  assets: string[];
  macroKeys: string[];
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
    countries: [],
    industries: [],
    assets: [],
    macroKeys: [],
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
    countries: event.countries,
    industries: event.industries,
    assets: event.assets,
    macroKeys: event.macroKeys,
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
    countries: form.countries,
    industries: form.industries,
    assets: form.assets,
    macroKeys: form.macroKeys,
    sourceUrl: form.sourceUrl.trim() || null,
  };
}

const COUNTRY_SUGGESTIONS = MACRO_COUNTRIES.map((c) => c.code);

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
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-2">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-200">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3 text-[11px]">
          <label className="block text-slate-400">
            标题（可选）
            <input
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
            />
          </label>
          <label className="block text-slate-400">
            事件内容 *
            <textarea
              value={form.content}
              onChange={(e) => patch({ content: e.target.value })}
              rows={4}
              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-slate-400">
              时间精度
              <select
                value={form.datePrecision}
                onChange={(e) =>
                  patch({ datePrecision: e.target.value as EventDatePrecision })
                }
                className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
              >
                <option value="DATE">仅日期</option>
                <option value="DATETIME">日期+时间</option>
              </select>
            </label>
            <label className="block text-slate-400">
              重要性
              <select
                value={form.importance}
                onChange={(e) =>
                  patch({ importance: e.target.value as EventImportance })
                }
                className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
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
            <label className="block text-slate-400">
              发生日期 *
              <input
                type="date"
                value={form.occurredAt}
                onChange={(e) => patch({ occurredAt: e.target.value })}
                className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
              />
            </label>
            {form.datePrecision === "DATETIME" ? (
              <label className="block text-slate-400">
                时间 (UTC)
                <input
                  type="time"
                  value={form.occurredTime}
                  onChange={(e) => patch({ occurredTime: e.target.value })}
                  className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
                />
              </label>
            ) : (
              <label className="block text-slate-400">
                事件类型
                <select
                  value={form.eventType}
                  onChange={(e) => patch({ eventType: e.target.value })}
                  className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
                >
                  <option value="">—</option>
                  {EVENT_TYPE_SUGGESTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <TagInput
            label="国家标签"
            values={form.countries}
            onChange={(countries) => patch({ countries })}
            placeholder="如 CN、US，回车添加"
            suggestions={COUNTRY_SUGGESTIONS}
            uppercase
          />
          <TagInput
            label="行业标签"
            values={form.industries}
            onChange={(industries) => patch({ industries })}
            suggestions={EVENT_INDUSTRY_SUGGESTIONS}
          />
          <TagInput
            label="资产标签"
            values={form.assets}
            onChange={(assets) => patch({ assets })}
            placeholder="如 AAPL、000300.SH"
            uppercase
          />
          <TagInput
            label="宏观指标 key（可选）"
            values={form.macroKeys}
            onChange={(macroKeys) => patch({ macroKeys })}
            placeholder="如 fred:CPIAUCSL"
          />
          <label className="block text-slate-400">
            来源链接
            <input
              value={form.sourceUrl}
              onChange={(e) => patch({ sourceUrl: e.target.value })}
              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
            />
          </label>
          {error ? <p className="text-rose-300">{error}</p> : null}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-800 px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-700 px-3 py-1 text-slate-300 hover:bg-slate-900"
          >
            取消
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="rounded border border-emerald-700 bg-emerald-950/50 px-3 py-1 text-emerald-100 hover:border-emerald-500 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
