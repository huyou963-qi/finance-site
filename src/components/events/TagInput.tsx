"use client";

import { useCallback, useState } from "react";

export function TagInput({
  label,
  values,
  onChange,
  placeholder,
  suggestions,
  uppercase,
  formatLabel,
  normalizeAdd,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: readonly string[];
  uppercase?: boolean;
  /** 展示文案（存储值可仍为 code） */
  formatLabel?: (value: string) => string;
  /** 添加时规范存储值（如中文行业名 → GICS code） */
  normalizeAdd?: (raw: string) => string;
}) {
  const [draft, setDraft] = useState("");

  const toStored = useCallback(
    (raw: string) => {
      const t = (uppercase ? raw.trim().toUpperCase() : raw.trim()).replace(
        /\s+/g,
        " ",
      );
      if (!t) return "";
      return normalizeAdd ? normalizeAdd(t) : t;
    },
    [normalizeAdd, uppercase],
  );

  const add = useCallback(
    (raw: string) => {
      const t = toStored(raw);
      if (!t || values.includes(t)) return;
      onChange([...values, t]);
      setDraft("");
    },
    [onChange, toStored, values],
  );

  return (
    <label className="block text-[11px] text-fs-muted">
      {label}
      <div className="mt-0.5 rounded border border-fs-border bg-fs-elevated px-1.5 py-1">
        <div className="mb-1 flex flex-wrap gap-1">
          {values.map((v) => {
            const shown = formatLabel ? formatLabel(v) : v;
            return (
              <span
                key={v}
                title={shown !== v ? v : undefined}
                className="inline-flex items-center gap-0.5 rounded bg-fs-elevated px-1.5 py-0.5 text-[10px] text-fs-text"
              >
                {shown}
                <button
                  type="button"
                  className="text-fs-muted hover:text-rose-300"
                  onClick={() => onChange(values.filter((x) => x !== v))}
                  aria-label={`移除 ${shown}`}
                >
                  ×
                </button>
              </span>
            );
          })}
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
              .filter((s) => {
                const key = toStored(s);
                return key && !values.includes(key);
              })
              .slice(0, 11)
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => add(s)}
                  className="rounded border border-fs-border/80 px-1 py-0 text-[10px] text-fs-muted hover:border-fs-border hover:text-fs-secondary"
                >
                  + {formatLabel ? formatLabel(s) : s}
                </button>
              ))}
          </div>
        ) : null}
      </div>
    </label>
  );
}
