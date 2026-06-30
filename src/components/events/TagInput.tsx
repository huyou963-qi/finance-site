"use client";

import { useCallback, useState } from "react";

export function TagInput({
  label,
  values,
  onChange,
  placeholder,
  suggestions,
  uppercase,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: readonly string[];
  uppercase?: boolean;
}) {
  const [draft, setDraft] = useState("");

  const add = useCallback(
    (raw: string) => {
      const t = (uppercase ? raw.trim().toUpperCase() : raw.trim()).replace(/\s+/g, " ");
      if (!t || values.includes(t)) return;
      onChange([...values, t]);
      setDraft("");
    },
    [onChange, uppercase, values],
  );

  return (
    <label className="block text-[11px] text-fs-muted">
      {label}
      <div className="mt-0.5 rounded border border-fs-border bg-fs-elevated px-1.5 py-1">
        <div className="mb-1 flex flex-wrap gap-1">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-0.5 rounded bg-fs-elevated px-1.5 py-0.5 text-[10px] text-fs-text"
            >
              {v}
              <button
                type="button"
                className="text-fs-muted hover:text-rose-300"
                onClick={() => onChange(values.filter((x) => x !== v))}
                aria-label={`移除 ${v}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            }
            if (e.key === "Backspace" && !draft && values.length > 0) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (draft.trim()) add(draft);
          }}
          placeholder={placeholder}
          className="w-full bg-transparent text-[11px] text-fs-text outline-none placeholder:text-fs-secondary"
        />
        {suggestions?.length ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {suggestions
              .filter((s) => !values.includes(s))
              .slice(0, 8)
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => add(s)}
                  className="rounded border border-fs-border/80 px-1 py-0 text-[10px] text-fs-muted hover:border-fs-border hover:text-fs-secondary"
                >
                  + {s}
                </button>
              ))}
          </div>
        ) : null}
      </div>
    </label>
  );
}
