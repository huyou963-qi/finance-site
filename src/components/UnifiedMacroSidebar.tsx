"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_UNIFIED_SERIES_KEYS,
  getUnifiedCatalogGroups,
  MACRO_MAX_SERIES,
} from "@/lib/data/macroCatalog";
import type { MacroSlotAssignment } from "@/lib/macroPartition";

export type UnifiedMacroSidebarProps = {
  selectedKeys: Set<string>;
  onChange: (keys: Set<string>) => void;
  disabled?: boolean;
  layoutMode?: 1 | 2 | 3 | 4;
  slotAssignment: MacroSlotAssignment;
  onSlotAssignmentChange: (key: string, slotIndex: number | null) => void;
};

export function UnifiedMacroSidebar({
  selectedKeys,
  onChange,
  disabled,
  layoutMode = 1,
  slotAssignment,
  onSlotAssignmentChange,
}: UnifiedMacroSidebarProps) {
  const count = selectedKeys.size;
  const [searchQuery, setSearchQuery] = useState("");

  const catalogGroups = useMemo(() => getUnifiedCatalogGroups(), []);

  const filteredBlocks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return catalogGroups;
    return catalogGroups
      .map((g) => ({
        name: g.name,
        items: g.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.key.toLowerCase().includes(q) ||
            g.name.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [catalogGroups, searchQuery]);

  function resolvedSlot(key: string): number | null {
    const cap = Math.max(0, layoutMode - 1);
    const s = slotAssignment[key];
    if (s === null) return null;
    if (s === undefined || Number.isNaN(s)) return 0;
    return Math.min(cap, Math.max(0, s));
  }

  function toggle(key: string) {
    if (disabled) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      if (next.size <= 1) return;
      next.delete(key);
    } else {
      if (next.size >= MACRO_MAX_SERIES) return;
      next.add(key);
    }
    onChange(next);
  }

  function resetDefault() {
    if (disabled) return;
    onChange(new Set(DEFAULT_UNIFIED_SERIES_KEYS));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          已选 <span className="text-slate-300">{count}</span> / {MACRO_MAX_SERIES}
        </span>
        <button
          type="button"
          onClick={resetDefault}
          disabled={disabled}
          className="rounded border border-slate-700 px-2 py-0.5 text-slate-400 hover:border-slate-500 hover:text-slate-200 disabled:opacity-40"
        >
          恢复默认
        </button>
      </div>

      <label className="flex flex-col gap-1 text-xs text-slate-500">
        <span className="text-slate-400">搜索经济体 / 指标</span>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="例如：通胀、非农、日本…"
          disabled={disabled}
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-slate-500 focus:outline-none disabled:opacity-40"
        />
      </label>

      <div className="max-h-[min(62vh,680px)] overflow-y-auto pr-1">
        <ul className="space-y-2">
          {filteredBlocks.map((block) => (
            <li key={block.name}>
              <details className="group rounded-md border border-slate-800/90 bg-slate-900/50 open:border-slate-700">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-slate-200 marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-2">
                    <span>{block.name}</span>
                    <span className="text-xs font-normal text-slate-500 group-open:rotate-0">
                      <span className="text-slate-600 group-open:hidden">展开</span>
                      <span className="hidden text-slate-600 group-open:inline">收起</span>
                    </span>
                  </span>
                </summary>
                <ul className="space-y-1 border-t border-slate-800/80 px-2 py-2">
                  {block.items.map(({ key, label }) => {
                    const checked = selectedKeys.has(key);
                    return (
                      <li key={key}>
                        <div
                          className={`flex flex-wrap items-center gap-2 rounded-md px-1 py-1 text-sm ${
                            disabled ? "opacity-40" : "hover:bg-slate-900/90"
                          }`}
                        >
                          <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-0.5 shrink-0 accent-emerald-600"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggle(key)}
                            />
                            <span className="text-slate-300">{label}</span>
                          </label>
                          {checked ? (
                            <select
                              value={resolvedSlot(key) === null ? -1 : resolvedSlot(key)!}
                              disabled={disabled}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                onSlotAssignmentChange(key, v === -1 ? null : v);
                              }}
                              className="shrink-0 rounded border border-slate-600 bg-slate-950 px-1.5 py-0.5 text-[11px] text-slate-300"
                              title="显示在哪张图"
                            >
                              <option value={-1}>待选集</option>
                              {Array.from({ length: layoutMode }, (_, i) => (
                                <option key={i} value={i}>
                                  图 {i + 1}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </details>
            </li>
          ))}
        </ul>
        {filteredBlocks.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500">无匹配项，请调整搜索词</p>
        ) : null}
      </div>
    </div>
  );
}
