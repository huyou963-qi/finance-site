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
    <label className="block text-[11px] text-slate-400">
      {label}
      <div className="mt-0.5 rounded border border-slate-700 bg-slate-900 px-1.5 py-1">
        <div className="mb-1 flex flex-wrap gap-1">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-0.5 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200"
            >
              {v}
              <button
                type="button"
                className="text-slate-500 hover:text-rose-300"
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
          className="w-full bg-transparent text-[11px] text-slate-100 outline-none placeholder:text-slate-600"
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
                  className="rounded border border-slate-700/80 px-1 py-0 text-[10px] text-slate-500 hover:border-slate-500 hover:text-slate-300"
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
