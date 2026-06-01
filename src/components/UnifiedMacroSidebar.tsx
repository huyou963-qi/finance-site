"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_UNIFIED_SERIES_KEYS,
  MACRO_MAX_SERIES,
  type UnifiedCatalogCountry,
} from "@/lib/data/macroCatalog";

const DEFAULT_OPEN_COUNTRY_CODES = new Set(["CN", "US"]);
const DEFAULT_OPEN_CATEGORY_NAMES = new Set([
  "国民经济核算",
  "价格指数",
  "就业与工资",
]);

function categoryCompositeKey(countryCode: string, categoryName: string): string {
  return `${countryCode}:${categoryName}`;
}

function buildDefaultOpenCategories(): Set<string> {
  const out = new Set<string>();
  for (const countryCode of DEFAULT_OPEN_COUNTRY_CODES) {
    for (const categoryName of DEFAULT_OPEN_CATEGORY_NAMES) {
      out.add(categoryCompositeKey(countryCode, categoryName));
    }
  }
  return out;
}

function findIndicatorInCatalog(
  catalogCountries: UnifiedCatalogCountry[],
  key: string,
): { countryCode: string; categoryName: string } | null {
  for (const country of catalogCountries) {
    for (const category of country.categories) {
      if (category.items.some((item) => item.key === key)) {
        return { countryCode: country.code, categoryName: category.name };
      }
    }
  }
  return null;
}

function ExpandToggle({
  open,
  onToggle,
  label,
  disabled,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-expanded={open}
      aria-label={open ? `折叠${label}` : `展开${label}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-600/90 bg-slate-800/90 text-[13px] leading-none font-medium text-slate-300 hover:border-slate-500 hover:bg-slate-700/90 hover:text-slate-100 disabled:opacity-40"
    >
      {open ? "−" : "+"}
    </button>
  );
}

function TreeSectionHeader({
  open,
  onToggle,
  label,
  disabled,
  level,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
  level: "country" | "category";
  children: ReactNode;
}) {
  const levelClass =
    level === "country"
      ? "text-sm font-semibold text-slate-100"
      : "text-xs font-medium text-slate-300";

  return (
    <div
      className={`flex items-center gap-2 ${level === "country" ? "px-3 py-2" : "px-2 py-1.5"}`}
    >
      <ExpandToggle open={open} onToggle={onToggle} label={label} disabled={disabled} />
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        className={`min-w-0 flex-1 truncate text-left ${levelClass} hover:text-white disabled:opacity-40`}
      >
        {children}
      </button>
    </div>
  );
}

export type UnifiedMacroSidebarProps = {
  selectedKeys: Set<string>;
  onChange: (keys: Set<string>) => void;
  disabled?: boolean;
  /** 来自 `/api/data/fmp-catalog`（国家 → 分类 → 指标）；null 表示加载中 */
  catalogCountries: UnifiedCatalogCountry[] | null;
  catalogError?: string | null;
  /** 双击已选指标时传入，展开指标树并滚动定位 */
  locateKey?: string | null;
  onLocateKeyHandled?: () => void;
};

export function UnifiedMacroSidebar({
  selectedKeys,
  onChange,
  disabled,
  catalogCountries,
  catalogError,
  locateKey,
  onLocateKeyHandled,
}: UnifiedMacroSidebarProps) {
  const count = selectedKeys.size;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [openCountries, setOpenCountries] = useState(() => new Set(DEFAULT_OPEN_COUNTRY_CODES));
  const [openCategories, setOpenCategories] = useState(buildDefaultOpenCategories);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);

  const isSearchMode = searchQuery.trim().length > 0;

  function toggleCountry(code: string) {
    setOpenCountries((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleCategory(countryCode: string, categoryName: string) {
    const composite = categoryCompositeKey(countryCode, categoryName);
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(composite)) next.delete(composite);
      else next.add(composite);
      return next;
    });
  }

  function isCountryOpen(code: string) {
    return isSearchMode || openCountries.has(code);
  }

  function isCategoryOpen(countryCode: string, categoryName: string) {
    return isSearchMode || openCategories.has(categoryCompositeKey(countryCode, categoryName));
  }

  useEffect(() => {
    if (!locateKey || !catalogCountries) return;

    const path = findIndicatorInCatalog(catalogCountries, locateKey);
    if (path) {
      setSearchQuery("");
      setOpenCountries((prev) => {
        const next = new Set(prev);
        next.add(path.countryCode);
        return next;
      });
      setOpenCategories((prev) => {
        const next = new Set(prev);
        next.add(categoryCompositeKey(path.countryCode, path.categoryName));
        return next;
      });
    }

    const timer = window.setTimeout(() => {
      const root = scrollRef.current;
      const escaped =
        typeof CSS !== "undefined" && "escape" in CSS ? CSS.escape(locateKey) : locateKey;
      const el = root?.querySelector<HTMLElement>(`[data-indicator-key="${escaped}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        setHighlightKey(locateKey);
        window.setTimeout(() => setHighlightKey((prev) => (prev === locateKey ? null : prev)), 2500);
      }
      onLocateKeyHandled?.();
    }, 60);

    return () => window.clearTimeout(timer);
  }, [catalogCountries, locateKey, onLocateKeyHandled]);

  const filteredCountries = useMemo(() => {
    if (!catalogCountries) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return catalogCountries;

    return catalogCountries
      .map((country) => {
        const matchCountry =
          country.name.toLowerCase().includes(q) ||
          country.code.toLowerCase().includes(q);
        const categories = country.categories
          .map((category) => {
            const matchCategory = category.name.toLowerCase().includes(q);
            const items = category.items.filter(
              (item) =>
                matchCountry ||
                matchCategory ||
                item.label.toLowerCase().includes(q) ||
                item.key.toLowerCase().includes(q),
            );
            return { ...category, items };
          })
          .filter((category) => category.items.length > 0);
        return { ...country, categories };
      })
      .filter((country) => country.categories.length > 0);
  }, [catalogCountries, searchQuery]);

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

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
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

      <label className="block shrink-0 text-xs text-slate-500">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="例如：中国、GDP、通胀、利率、贸易…"
          disabled={disabled}
          aria-label="搜索指标"
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-slate-500 focus:outline-none disabled:opacity-40"
        />
      </label>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
        {catalogError ? (
          <p className="rounded-md border border-amber-900/50 bg-amber-950/20 px-2 py-2 text-[11px] leading-relaxed text-amber-100/90">
            指标目录加载失败：{catalogError}
          </p>
        ) : null}
        {!catalogCountries && !catalogError ? (
          <p className="py-6 text-center text-xs text-slate-500">正在加载宏观指标目录…</p>
        ) : null}
        <ul className="space-y-2">
          {filteredCountries.map((country) => {
            const countryOpen = isCountryOpen(country.code);
            return (
              <li key={country.code}>
                <div
                  className={`rounded-md border bg-slate-900/50 ${
                    countryOpen ? "border-slate-700" : "border-slate-800/90"
                  }`}
                >
                  <TreeSectionHeader
                    level="country"
                    open={countryOpen}
                    onToggle={() => toggleCountry(country.code)}
                    label={country.name}
                    disabled={disabled}
                  >
                    {country.name}
                    <span className="ml-2 text-[11px] font-normal text-slate-500">
                      {country.code}
                    </span>
                  </TreeSectionHeader>
                  {countryOpen ? (
                    <ul className="space-y-1 border-t border-slate-800/80 px-2 pb-2 pt-1">
                      {country.categories.map((category) => {
                        const categoryOpen = isCategoryOpen(country.code, category.name);
                        return (
                          <li key={`${country.code}:${category.name}`}>
                            <div className="rounded border border-slate-800/80 bg-slate-950/45">
                              <TreeSectionHeader
                                level="category"
                                open={categoryOpen}
                                onToggle={() => toggleCategory(country.code, category.name)}
                                label={category.name}
                                disabled={disabled}
                              >
                                {category.name}
                              </TreeSectionHeader>
                              {categoryOpen ? (
                                <ul className="space-y-0.5 border-t border-slate-800/70 py-1.5 pl-7 pr-2">
                                  {category.items.map(({ key, label, frequency }) => {
                                    const checked = selectedKeys.has(key);
                                    const highlighted = highlightKey === key;
                                    return (
                                      <li key={key}>
                                        <div
                                          data-indicator-key={key}
                                          className={`flex flex-wrap items-center gap-1.5 rounded-md px-1 py-0.5 transition ${
                                            disabled ? "opacity-40" : "hover:bg-slate-900/90"
                                          } ${
                                            highlighted
                                              ? "bg-cyan-950/45 ring-1 ring-cyan-500/50"
                                              : ""
                                          }`}
                                        >
                                          <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-1.5">
                                            <input
                                              type="checkbox"
                                              className="mt-0.5 shrink-0 accent-emerald-600"
                                              checked={checked}
                                              disabled={disabled}
                                              onChange={() => toggle(key)}
                                            />
                                            <span className="text-[11px] leading-snug text-slate-300">
                                              {label}
                                            </span>
                                            <span className="shrink-0 rounded border border-slate-700/90 px-1 py-0 text-[9px] text-slate-500">
                                              {frequency}
                                            </span>
                                          </label>
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {catalogCountries && !catalogError && filteredCountries.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500">无匹配项，请调整搜索词</p>
        ) : null}
      </div>
    </div>
  );
}
