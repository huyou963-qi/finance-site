"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_UNIFIED_SERIES_KEYS,
  MACRO_MAX_SERIES,
  type UnifiedCatalogCountry,
} from "@/lib/data/macroCatalog";
import {
  CPI_SUBGROUP,
  PRICE_INDEX_CATEGORY,
  categoryTreeKey,
  filterUnifiedCatalogCountry,
  findIndicatorPath,
} from "@/lib/data/catalogTree";

const DEFAULT_OPEN_COUNTRY_CODES = new Set(["CN", "US"]);
const DEFAULT_OPEN_CATEGORY_NAMES = new Set([
  "国民经济核算",
  "价格指数",
  "就业与工资",
  "CFTC数据",
]);

function categoryCompositeKey(countryCode: string, categoryName: string, subgroupName?: string | null) {
  return categoryTreeKey(countryCode, categoryName, subgroupName);
}

function buildDefaultOpenCategories(): Set<string> {
  const out = new Set<string>();
  for (const countryCode of DEFAULT_OPEN_COUNTRY_CODES) {
    for (const categoryName of DEFAULT_OPEN_CATEGORY_NAMES) {
      out.add(categoryTreeKey(countryCode, categoryName));
      if (categoryName === PRICE_INDEX_CATEGORY) {
        out.add(categoryTreeKey(countryCode, categoryName, CPI_SUBGROUP));
      }
    }
  }
  return out;
}

function findIndicatorInCatalog(
  catalogCountries: UnifiedCatalogCountry[],
  key: string,
): { countryCode: string; categoryName: string; subgroupName: string | null } | null {
  return findIndicatorPath(catalogCountries, key);
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
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-fs-border/90 bg-fs-elevated/90 text-[13px] leading-none font-medium text-fs-secondary hover:border-fs-border hover:bg-fs-border/90 hover:text-fs-text disabled:opacity-40"
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
  level: "country" | "category" | "subgroup";
  children: ReactNode;
}) {
  const levelClass =
    level === "country"
      ? "text-sm font-semibold text-fs-text"
      : level === "category"
        ? "text-xs font-medium text-fs-secondary"
        : "text-[11px] font-medium text-fs-muted";

  return (
    <div
      className={`flex items-center gap-2 ${level === "country" ? "px-3 py-2" : "px-2 py-1.5"}`}
    >
      <ExpandToggle open={open} onToggle={onToggle} label={label} disabled={disabled} />
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        className={`min-w-0 flex-1 truncate text-left ${levelClass} hover:text-fs-text disabled:opacity-40`}
      >
        {children}
      </button>
    </div>
  );
}

function IndicatorPickRow({
  itemKey,
  label,
  frequency,
  checked,
  highlighted,
  disabled,
  atLimit,
  onToggle,
}: {
  itemKey: string;
  label: string;
  frequency: string;
  checked: boolean;
  highlighted: boolean;
  disabled?: boolean;
  atLimit: boolean;
  onToggle: () => void;
}) {
  return (
    <li key={itemKey}>
      <div
        data-indicator-key={itemKey}
        className={`flex flex-wrap items-center gap-1.5 rounded-md px-1 py-0.5 transition ${
          disabled ? "opacity-40" : "hover:bg-fs-elevated/90"
        } ${highlighted ? "bg-cyan-950/45 ring-1 ring-cyan-500/50" : ""}`}
      >
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-1.5">
          <input
            type="checkbox"
            className="mt-0.5 shrink-0 accent-fs-accent"
            checked={checked}
            disabled={disabled || (!checked && atLimit)}
            onChange={onToggle}
          />
          <span className="text-[11px] leading-snug text-fs-secondary">{label}</span>
          <span className="shrink-0 rounded border border-fs-border/90 px-1 py-0 text-[9px] text-fs-muted">
            {frequency}
          </span>
        </label>
      </div>
    </li>
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

  function toggleCategory(
    countryCode: string,
    categoryName: string,
    subgroupName?: string | null,
  ) {
    const composite = categoryCompositeKey(countryCode, categoryName, subgroupName);
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

  function isCategoryOpen(
    countryCode: string,
    categoryName: string,
    subgroupName?: string | null,
  ) {
    return (
      isSearchMode || openCategories.has(categoryCompositeKey(countryCode, categoryName, subgroupName))
    );
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
        if (path.subgroupName) {
          next.add(categoryCompositeKey(path.countryCode, path.categoryName, path.subgroupName));
        }
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
    const q = searchQuery.trim();
    if (!q) return catalogCountries;
    return catalogCountries
      .map((country) => filterUnifiedCatalogCountry(country, q))
      .filter((country) => country.categories.length > 0);
  }, [catalogCountries, searchQuery]);

  const [limitHint, setLimitHint] = useState(false);

  useEffect(() => {
    if (!limitHint) return;
    const timer = window.setTimeout(() => setLimitHint(false), 2800);
    return () => window.clearTimeout(timer);
  }, [limitHint]);

  function toggle(key: string) {
    if (disabled) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      if (next.size >= MACRO_MAX_SERIES) {
        setLimitHint(true);
        return;
      }
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
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-fs-muted">
        <span>
          已选 <span className="text-fs-secondary">{count}</span> / {MACRO_MAX_SERIES}
          {limitHint ? (
            <span className="ml-2 text-amber-300/90">已达上限</span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={resetDefault}
          disabled={disabled}
          className="rounded border border-fs-border px-2 py-0.5 text-fs-muted hover:border-fs-border hover:text-fs-text disabled:opacity-40"
        >
          恢复默认
        </button>
      </div>

      <label className="block shrink-0 text-xs text-fs-muted">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="例如：中国、GDP、通胀、利率、贸易…"
          disabled={disabled}
          aria-label="搜索指标"
          className="w-full rounded-md border border-fs-border bg-fs-elevated px-2 py-1.5 text-sm text-fs-text placeholder:text-fs-secondary focus:border-fs-border focus:outline-none disabled:opacity-40"
        />
      </label>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
        {catalogError ? (
          <p className="rounded-md border border-amber-900/50 bg-amber-950/20 px-2 py-2 text-[11px] leading-relaxed text-amber-100/90">
            指标目录加载失败：{catalogError}
          </p>
        ) : null}
        {!catalogCountries && !catalogError ? (
          <p className="py-6 text-center text-xs text-fs-muted">正在加载宏观指标目录…</p>
        ) : null}
        <ul className="space-y-2">
          {filteredCountries.map((country) => {
            const countryOpen = isCountryOpen(country.code);
            return (
              <li key={country.code}>
                <div
                  className={`rounded-md border bg-fs-elevated/80 ${
                    countryOpen ? "border-fs-border" : "border-fs-border/90"
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
                    <span className="ml-2 text-[11px] font-normal text-fs-muted">
                      {country.code}
                    </span>
                  </TreeSectionHeader>
                  {countryOpen ? (
                    <ul className="space-y-1 border-t border-fs-border px-2 pb-2 pt-1">
                      {country.categories.map((category) => {
                        const categoryOpen = isCategoryOpen(country.code, category.name);
                        return (
                          <li key={`${country.code}:${category.name}`}>
                            <div className="rounded border border-fs-border bg-fs-bg/45">
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
                                <ul className="space-y-0.5 border-t border-fs-border/70 py-1.5 pl-7 pr-2">
                                  {category.items.map(({ key, label, frequency }) => (
                                    <IndicatorPickRow
                                      key={key}
                                      itemKey={key}
                                      label={label}
                                      frequency={frequency}
                                      checked={selectedKeys.has(key)}
                                      highlighted={highlightKey === key}
                                      disabled={disabled}
                                      atLimit={count >= MACRO_MAX_SERIES}
                                      onToggle={() => toggle(key)}
                                    />
                                  ))}
                                  {(category.subgroups ?? []).map((subgroup) => {
                                    const sgOpen = isCategoryOpen(
                                      country.code,
                                      category.name,
                                      subgroup.name,
                                    );
                                    return (
                                      <li
                                        key={`${country.code}:${category.name}:${subgroup.name}`}
                                        className="list-none"
                                      >
                                        <div className="mt-1 rounded border border-fs-border bg-fs-bg/30">
                                          <TreeSectionHeader
                                            level="subgroup"
                                            open={sgOpen}
                                            onToggle={() =>
                                              toggleCategory(
                                                country.code,
                                                category.name,
                                                subgroup.name,
                                              )
                                            }
                                            label={subgroup.name}
                                            disabled={disabled}
                                          >
                                            {subgroup.name}
                                          </TreeSectionHeader>
                                          {sgOpen ? (
                                            <ul className="space-y-0.5 border-t border-fs-border py-1 pl-5 pr-1">
                                              {subgroup.items.map(({ key, label, frequency }) => (
                                                <IndicatorPickRow
                                                  key={key}
                                                  itemKey={key}
                                                  label={label}
                                                  frequency={frequency}
                                                  checked={selectedKeys.has(key)}
                                                  highlighted={highlightKey === key}
                                                  disabled={disabled}
                                                  atLimit={count >= MACRO_MAX_SERIES}
                                                  onToggle={() => toggle(key)}
                                                />
                                              ))}
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
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {catalogCountries && !catalogError && filteredCountries.length === 0 ? (
          <p className="py-4 text-center text-xs text-fs-muted">无匹配项，请调整搜索词</p>
        ) : null}
      </div>
    </div>
  );
}
