"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_UNIFIED_SERIES_KEYS,
  MACRO_MAX_SERIES,
  type UnifiedCatalogGroup,
} from "@/lib/data/macroCatalog";

export type UnifiedMacroSidebarProps = {
  selectedKeys: Set<string>;
  onChange: (keys: Set<string>) => void;
  disabled?: boolean;
  /** 来自 `/api/data/fmp-catalog`（当前返回 FRED 目录）；null 表示加载中 */
  catalogGroups: UnifiedCatalogGroup[] | null;
  catalogError?: string | null;
};

export function UnifiedMacroSidebar({
  selectedKeys,
  onChange,
  disabled,
  catalogGroups,
  catalogError,
}: UnifiedMacroSidebarProps) {
  const count = selectedKeys.size;
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedSeriesId, setCopiedSeriesId] = useState<string | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);

  const defaultOpenCategories = new Set([
    "增长与景气",
    "通胀与价格",
    "就业与劳动力",
  ]);

  const filteredBlocks = useMemo(() => {
    if (!catalogGroups) return [];
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

  function toggle(key: string) {
    if (disabled) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) {
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

  async function copySeriesId(seriesId: string) {
    try {
      await navigator.clipboard.writeText(seriesId);
      setCopiedSeriesId(seriesId);
      setToastText(`已复制 ${seriesId}`);
      window.setTimeout(() => {
        setCopiedSeriesId((prev) => (prev === seriesId ? null : prev));
      }, 1200);
      window.setTimeout(() => {
        setToastText((prev) => (prev?.includes(seriesId) ? null : prev));
      }, 1400);
    } catch {
      setToastText("复制失败：当前环境不支持剪贴板权限");
      window.setTimeout(() => setToastText(null), 1800);
    }
  }

  return (
    <div className="relative flex flex-col gap-3">
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
        <span className="text-slate-400">搜索指标</span>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="例如：GDP、失业、利率、零售…"
          disabled={disabled}
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-slate-500 focus:outline-none disabled:opacity-40"
        />
      </label>

      <div className="max-h-[min(62vh,680px)] overflow-y-auto pr-1">
        {catalogError ? (
          <p className="rounded-md border border-amber-900/50 bg-amber-950/20 px-2 py-2 text-[11px] leading-relaxed text-amber-100/90">
            指标目录加载失败：{catalogError}
          </p>
        ) : null}
        {!catalogGroups && !catalogError ? (
          <p className="py-6 text-center text-xs text-slate-500">正在加载 FRED 指标目录…</p>
        ) : null}
        <ul className="space-y-2">
          {filteredBlocks.map((block) => (
            <li key={`${block.name}:${searchQuery.trim().length > 0 ? "q" : "nq"}`}>
              <details
                open={searchQuery.trim().length > 0 || defaultOpenCategories.has(block.name)}
                className="group rounded-md border border-slate-800/90 bg-slate-900/50 open:border-slate-700"
              >
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
                  {block.items.map(({ key, label, frequency }) => {
                    const checked = selectedKeys.has(key);
                    const seriesId = key.startsWith("fred:") ? key.slice(5) : key;
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
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                copySeriesId(seriesId).catch(() => {});
                              }}
                              className="shrink-0 rounded border border-slate-700 px-1 py-0 text-[10px] text-slate-300 hover:border-slate-500 hover:text-slate-100 disabled:opacity-40"
                              title={`复制 ${seriesId}`}
                            >
                              {copiedSeriesId === seriesId ? "已复制" : seriesId}
                            </button>
                            <span className="shrink-0 rounded border border-slate-700 px-1 py-0 text-[10px] text-slate-400">
                              {frequency}
                            </span>
                          </label>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </details>
            </li>
          ))}
        </ul>
        {catalogGroups && !catalogError && filteredBlocks.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500">无匹配项，请调整搜索词</p>
        ) : null}
      </div>
      {toastText ? (
        <div className="pointer-events-none absolute right-2 bottom-2 z-20 rounded-md border border-slate-700 bg-slate-900/95 px-2 py-1 text-xs text-slate-100 shadow">
          {toastText}
        </div>
      ) : null}
    </div>
  );
}
