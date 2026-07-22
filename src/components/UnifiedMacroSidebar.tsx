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
import {
  defaultVariantChoices,
  labelForVariantKey,
  variantKeysForBase,
} from "@/lib/data/fredTitleZh";

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
  labelEn,
  frequency,
  checked,
  highlighted,
  disabled,
  atLimit,
  onToggle,
  onDoubleClickAdd,
  badge,
  weakBadge,
}: {
  itemKey: string;
  label: string;
  labelEn?: string | null;
  frequency: string;
  checked: boolean;
  highlighted: boolean;
  disabled?: boolean;
  atLimit: boolean;
  onToggle: () => void;
  onDoubleClickAdd?: () => void;
  badge?: string | null;
  weakBadge?: boolean;
}) {
  const showEn =
    Boolean(labelEn?.trim()) &&
    labelEn!.trim() !== label.trim() &&
    !label.includes(labelEn!.trim());
  return (
    <li>
      <div
        data-indicator-key={itemKey}
        onDoubleClick={(e) => {
          e.preventDefault();
          onDoubleClickAdd?.();
        }}
        title={onDoubleClickAdd ? "双击选择原值/同比/环比后添加" : undefined}
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
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] leading-snug text-fs-secondary">{label}</span>
            {showEn ? (
              <span className="mt-0.5 block truncate text-[9px] leading-snug text-fs-muted">
                {labelEn}
              </span>
            ) : null}
          </span>
          {weakBadge ? (
            <span className="shrink-0 rounded border border-fs-border/80 px-1 py-0 text-[9px] text-fs-muted">
              弱译
            </span>
          ) : null}
          {badge ? (
            <span className="shrink-0 rounded border border-amber-800/60 bg-amber-950/30 px-1 py-0 text-[9px] text-amber-200/90">
              {badge}
            </span>
          ) : null}
          <span className="shrink-0 rounded border border-fs-border/90 px-1 py-0 text-[9px] text-fs-muted">
            {frequency}
          </span>
        </label>
      </div>
    </li>
  );
}

type VariantPickerTarget = {
  mode: "local" | "external";
  baseKey: string;
  source: string;
  sourceSeriesKey: string;
  titleZh: string;
  titleEn: string | null;
  frequency: string | null;
  units: string | null;
  alreadyLocal: boolean;
  needsOnboard: boolean;
};

function VariantPickerModal({
  target,
  busy,
  onCancel,
  onConfirm,
}: {
  target: VariantPickerTarget;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (choices: { level: boolean; yoy: boolean; mom: boolean }) => void;
}) {
  const defaults = defaultVariantChoices({
    frequency: target.frequency,
    units: target.units,
    titleEn: target.titleEn,
  });
  const [level, setLevel] = useState(defaults.level);
  const [yoy, setYoy] = useState(defaults.yoy);
  const [mom, setMom] = useState(defaults.mom);

  useEffect(() => {
    const d = defaultVariantChoices({
      frequency: target.frequency,
      units: target.units,
      titleEn: target.titleEn,
    });
    setLevel(d.level);
    setYoy(d.yoy);
    setMom(d.mom);
  }, [target.baseKey, target.frequency, target.units, target.titleEn]);

  const any = level || yoy || mom;

  return (
    <div
      className="absolute inset-0 z-40 flex items-end justify-center bg-black/50 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="选择添加形态"
    >
      <div className="w-full max-w-sm rounded-lg border border-fs-border bg-fs-bg p-3 shadow-xl">
        <p className="text-xs font-medium text-fs-text">添加指标形态</p>
        <p className="mt-1 text-[11px] leading-snug text-fs-secondary">{target.titleZh}</p>
        {target.titleEn && target.titleEn !== target.titleZh ? (
          <p className="mt-0.5 text-[10px] text-fs-muted">{target.titleEn}</p>
        ) : null}
        <div className="mt-3 space-y-2 text-[11px] text-fs-secondary">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={level}
              onChange={(e) => setLevel(e.target.checked)}
              className="accent-fs-accent"
            />
            原值（水平序列）
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={yoy}
              onChange={(e) => setYoy(e.target.checked)}
              className="accent-fs-accent"
            />
            同比
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={mom}
              onChange={(e) => setMom(e.target.checked)}
              className="accent-fs-accent"
            />
            环比
          </label>
        </div>
        <p className="mt-2 text-[10px] text-fs-muted">
          同比/环比在客户端由原值计算，不额外拉取 FRED 序列。
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded border border-fs-border px-2.5 py-1 text-[11px] text-fs-muted hover:text-fs-text disabled:opacity-40"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy || !any}
            onClick={() => onConfirm({ level, yoy, mom })}
            className="rounded border border-fs-accent/50 bg-fs-accent-soft px-2.5 py-1 text-[11px] font-medium text-fs-accent-text disabled:opacity-40"
          >
            {busy ? "处理中…" : "确认添加"}
          </button>
        </div>
      </div>
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
  /** 外部指标入库后刷新目录 allowlist */
  onCatalogRefresh?: () => void;
  /** 入库成功后立刻放行新键，避免刷新完成前被 allowlist 剔除 */
  onAllowlistExpand?: (key: string, label?: string) => void;
  /** 批量放行（原值 + 变体） */
  onAllowlistExpandMany?: (entries: { key: string; label?: string }[]) => void;
};

export function UnifiedMacroSidebar({
  selectedKeys,
  onChange,
  disabled,
  catalogCountries,
  catalogError,
  locateKey,
  onLocateKeyHandled,
  onCatalogRefresh,
  onAllowlistExpand,
  onAllowlistExpandMany,
}: UnifiedMacroSidebarProps) {
  const count = selectedKeys.size;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [openCountries, setOpenCountries] = useState(() => new Set(DEFAULT_OPEN_COUNTRY_CODES));
  const [openCategories, setOpenCategories] = useState(buildDefaultOpenCategories);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [externalHits, setExternalHits] = useState<
    {
      origin: string;
      source: string;
      sourceSeriesKey: string;
      key: string | null;
      title: string;
      titleEn: string | null;
      titleZh: string | null;
      labelZhWeak: boolean;
      frequency: string | null;
      units: string | null;
      alreadyLocal: boolean;
      onboardingStatus: string | null;
    }[]
  >([]);
  const [pendingLocalHits, setPendingLocalHits] = useState<
    {
      key: string;
      title: string;
      titleEn: string | null;
      labelZhWeak: boolean;
      frequency: string | null;
      units: string | null;
      onboardingStatus: string | null;
    }[]
  >([]);
  const [externalNote, setExternalNote] = useState<string | null>(null);
  const [externalLoading, setExternalLoading] = useState(false);
  const [onboardingKey, setOnboardingKey] = useState<string | null>(null);
  const [variantTarget, setVariantTarget] = useState<VariantPickerTarget | null>(null);

  const isSearchMode = searchQuery.trim().length > 0;

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (!debouncedQuery) {
      setExternalHits([]);
      setPendingLocalHits([]);
      setExternalNote(null);
      setExternalLoading(false);
      return;
    }
    let cancelled = false;
    setExternalLoading(true);
    const url = `/api/data/indicator-search?q=${encodeURIComponent(debouncedQuery)}&limit=20`;
    fetch(url)
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as {
          local?: {
            key: string | null;
            title: string;
            titleEn?: string | null;
            labelZhWeak?: boolean;
            frequency: string | null;
            units?: string | null;
            onboardingStatus: string | null;
          }[];
          external?: typeof externalHits;
          externalNote?: string | null;
          error?: string;
        };
        if (!r.ok) throw new Error(j.error ?? `${r.status}`);
        return j;
      })
      .then((j) => {
        if (cancelled) return;
        setExternalHits(Array.isArray(j.external) ? j.external : []);
        const pending = (Array.isArray(j.local) ? j.local : [])
          .filter(
            (h) =>
              h.onboardingStatus === "pending_completion" &&
              typeof h.key === "string" &&
              h.key.length > 0,
          )
          .map((h) => ({
            key: h.key as string,
            title: h.title,
            titleEn: h.titleEn ?? null,
            labelZhWeak: Boolean(h.labelZhWeak),
            frequency: h.frequency,
            units: h.units ?? null,
            onboardingStatus: h.onboardingStatus,
          }));
        setPendingLocalHits(pending);
        setExternalNote(j.externalNote ?? null);
      })
      .catch((e) => {
        if (cancelled) return;
        setExternalHits([]);
        setPendingLocalHits([]);
        setExternalNote(e instanceof Error ? e.message : "外部搜索失败");
      })
      .finally(() => {
        if (!cancelled) setExternalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

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

  function addKeys(keys: string[]) {
    if (disabled || keys.length === 0) return;
    const next = new Set(selectedKeys);
    let hitLimit = false;
    for (const key of keys) {
      if (next.has(key)) continue;
      if (next.size >= MACRO_MAX_SERIES) {
        hitLimit = true;
        break;
      }
      next.add(key);
    }
    if (hitLimit) setLimitHint(true);
    onChange(next);
  }

  function addKey(key: string) {
    addKeys([key]);
  }

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

  function openVariantPicker(target: VariantPickerTarget) {
    if (disabled || onboardingKey) return;
    setVariantTarget(target);
  }

  function openLocalVariantPicker(key: string, label: string, frequency: string) {
    const baseKey = key.includes("::") ? key.split("::")[0]! : key;
    openVariantPicker({
      mode: "local",
      baseKey,
      source: baseKey.startsWith("wb:") ? "worldbank" : "fred",
      sourceSeriesKey: baseKey.startsWith("fred:")
        ? baseKey.slice(5)
        : baseKey.startsWith("wb:")
          ? baseKey.slice(3)
          : baseKey,
      titleZh: label,
      titleEn: null,
      frequency,
      units: null,
      alreadyLocal: true,
      needsOnboard: false,
    });
  }

  async function confirmVariantPicker(choices: {
    level: boolean;
    yoy: boolean;
    mom: boolean;
  }) {
    if (!variantTarget || disabled) return;
    const target = variantTarget;
    const lockId = `${target.source}:${target.sourceSeriesKey}`;
    setOnboardingKey(lockId);
    try {
      let baseKey = target.baseKey;
      let baseLabel = target.titleZh;

      if (target.needsOnboard) {
        const res = await fetch("/api/data/indicator-onboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: target.source === "worldbank" ? "worldbank" : "fred",
            sourceSeriesKey: target.sourceSeriesKey,
            titleHint: target.titleZh,
          }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          key?: string;
          error?: string;
          title?: string;
        };
        if (!res.ok) throw new Error(j.error ?? `${res.status}`);
        if (!j.key) throw new Error("入库未返回指标键");
        baseKey = j.key.includes("::") ? j.key.split("::")[0]! : j.key;
        baseLabel = j.title?.trim() || target.titleZh;
        onCatalogRefresh?.();
      }

      const keys = variantKeysForBase(baseKey, choices);
      const entries = keys.map((key) => ({
        key,
        label: labelForVariantKey(baseLabel, key),
      }));
      if (onAllowlistExpandMany) {
        onAllowlistExpandMany(entries);
      } else {
        for (const e of entries) onAllowlistExpand?.(e.key, e.label);
      }
      addKeys(keys);
      setVariantTarget(null);
    } catch (e) {
      setExternalNote(e instanceof Error ? e.message : "添加外部指标失败");
    } finally {
      setOnboardingKey(null);
    }
  }

  function resetDefault() {
    if (disabled) return;
    onChange(new Set(DEFAULT_UNIFIED_SERIES_KEYS));
  }

  const fredExternal = externalHits.filter((h) => h.origin === "fred" || h.source === "fred");
  const wbExternal = externalHits.filter(
    (h) => h.origin === "worldbank" || h.source === "worldbank",
  );

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-fs-muted">
        <span>
          已选 <span className="text-fs-secondary">{count}</span> / {MACRO_MAX_SERIES}
          <span className="text-fs-muted">（指标数上限）</span>
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
      {isSearchMode ? (
        <p className="shrink-0 text-[10px] leading-relaxed text-fs-muted">
          站内在上、外部在下；双击可选原值/同比/环比。外部新指标会弱译中文名并草稿入库。
        </p>
      ) : null}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
        {catalogError ? (
          <p className="rounded-md border border-amber-900/50 bg-amber-950/20 px-2 py-2 text-[11px] leading-relaxed text-amber-100/90">
            指标目录加载失败：{catalogError}
          </p>
        ) : null}
        {!catalogCountries && !catalogError ? (
          <p className="py-6 text-center text-xs text-fs-muted">正在加载宏观指标目录…</p>
        ) : null}

        {isSearchMode ? (
          <p className="mb-1.5 px-0.5 text-[11px] font-medium text-fs-secondary">站内指标</p>
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
                                      onDoubleClickAdd={() =>
                                        openLocalVariantPicker(key, label, frequency)
                                      }
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
                                                  onDoubleClickAdd={() =>
                                                    openLocalVariantPicker(key, label, frequency)
                                                  }
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

        {isSearchMode && pendingLocalHits.length > 0 ? (
          <div className="mt-3 rounded-md border border-amber-900/40 bg-amber-950/15">
            <p className="border-b border-amber-900/30 px-3 py-1.5 text-[11px] font-medium text-amber-100/90">
              待完善（可临时使用）
            </p>
            <ul className="space-y-0.5 px-2 py-1.5">
              {pendingLocalHits.map((hit) => (
                <IndicatorPickRow
                  key={`pending-${hit.key}`}
                  itemKey={hit.key}
                  label={hit.title}
                  labelEn={hit.titleEn}
                  frequency={hit.frequency ?? "—"}
                  checked={selectedKeys.has(hit.key)}
                  highlighted={highlightKey === hit.key}
                  disabled={disabled}
                  atLimit={count >= MACRO_MAX_SERIES}
                  badge="待完善"
                  weakBadge={hit.labelZhWeak}
                  onToggle={() => toggle(hit.key)}
                  onDoubleClickAdd={() =>
                    openVariantPicker({
                      mode: "local",
                      baseKey: hit.key.includes("::") ? hit.key.split("::")[0]! : hit.key,
                      source: hit.key.startsWith("wb:") ? "worldbank" : "fred",
                      sourceSeriesKey: hit.key.startsWith("fred:")
                        ? hit.key.slice(5).split("::")[0]!
                        : hit.key.startsWith("wb:")
                          ? hit.key.slice(3)
                          : hit.key,
                      titleZh: hit.title,
                      titleEn: hit.titleEn,
                      frequency: hit.frequency,
                      units: hit.units,
                      alreadyLocal: true,
                      needsOnboard: false,
                    })
                  }
                />
              ))}
            </ul>
          </div>
        ) : null}

        {isSearchMode ? (
          <div className="mt-3 space-y-2 border-t border-fs-border pt-3">
            <p className="px-0.5 text-[11px] font-medium text-fs-secondary">
              外部源
              {externalLoading ? (
                <span className="ml-2 font-normal text-fs-muted">搜索中…</span>
              ) : null}
            </p>
            {externalNote ? (
              <p className="rounded-md border border-fs-border/80 bg-fs-elevated/50 px-2 py-1.5 text-[10px] text-fs-muted">
                {externalNote}
              </p>
            ) : null}
            {fredExternal.length > 0 ? (
              <div className="rounded-md border border-fs-border bg-fs-elevated/80">
                <p className="border-b border-fs-border px-3 py-1.5 text-xs font-semibold text-fs-text">
                  FRED
                </p>
                <ul className="space-y-0.5 px-2 py-1.5">
                  {fredExternal.map((hit) => {
                    const rowKey = hit.key ?? `fred:${hit.sourceSeriesKey}`;
                    const lockId = `${hit.source}:${hit.sourceSeriesKey}`;
                    const busy = onboardingKey === lockId;
                    const openExt = () =>
                      openVariantPicker({
                        mode: "external",
                        baseKey: rowKey.includes("::") ? rowKey.split("::")[0]! : rowKey,
                        source: "fred",
                        sourceSeriesKey: hit.sourceSeriesKey,
                        titleZh: hit.titleZh || hit.title,
                        titleEn: hit.titleEn,
                        frequency: hit.frequency,
                        units: hit.units,
                        alreadyLocal: hit.alreadyLocal,
                        needsOnboard: !hit.alreadyLocal,
                      });
                    return (
                      <IndicatorPickRow
                        key={`ext-fred-${hit.sourceSeriesKey}`}
                        itemKey={rowKey}
                        label={hit.title}
                        labelEn={hit.titleEn}
                        frequency={hit.frequency ?? "—"}
                        checked={hit.key ? selectedKeys.has(hit.key) : false}
                        highlighted={false}
                        disabled={disabled || busy}
                        atLimit={count >= MACRO_MAX_SERIES}
                        weakBadge={hit.labelZhWeak}
                        badge={
                          hit.alreadyLocal
                            ? "已入库"
                            : busy
                              ? "入库中…"
                              : "外部"
                        }
                        onToggle={openExt}
                        onDoubleClickAdd={openExt}
                      />
                    );
                  })}
                </ul>
              </div>
            ) : null}
            {wbExternal.length > 0 ? (
              <div className="rounded-md border border-fs-border bg-fs-elevated/80">
                <p className="border-b border-fs-border px-3 py-1.5 text-xs font-semibold text-fs-text">
                  World Bank
                </p>
                <ul className="space-y-0.5 px-2 py-1.5">
                  {wbExternal.map((hit) => {
                    const rowKey = hit.key ?? `wb:${hit.sourceSeriesKey}`;
                    const lockId = `${hit.source}:${hit.sourceSeriesKey}`;
                    const busy = onboardingKey === lockId;
                    const openExt = () =>
                      openVariantPicker({
                        mode: "external",
                        baseKey: rowKey.includes("::") ? rowKey.split("::")[0]! : rowKey,
                        source: "worldbank",
                        sourceSeriesKey: hit.sourceSeriesKey,
                        titleZh: hit.titleZh || hit.title,
                        titleEn: hit.titleEn,
                        frequency: hit.frequency,
                        units: hit.units,
                        alreadyLocal: hit.alreadyLocal,
                        needsOnboard: !hit.alreadyLocal,
                      });
                    return (
                      <IndicatorPickRow
                        key={`ext-wb-${hit.sourceSeriesKey}`}
                        itemKey={rowKey}
                        label={hit.title}
                        labelEn={hit.titleEn}
                        frequency={hit.frequency ?? "年"}
                        checked={hit.key ? selectedKeys.has(hit.key) : false}
                        highlighted={false}
                        disabled={disabled || busy}
                        atLimit={count >= MACRO_MAX_SERIES}
                        weakBadge={hit.labelZhWeak}
                        badge={
                          hit.alreadyLocal
                            ? "已入库"
                            : busy
                              ? "入库中…"
                              : "外部"
                        }
                        onToggle={openExt}
                        onDoubleClickAdd={openExt}
                      />
                    );
                  })}
                </ul>
              </div>
            ) : null}
            {!externalLoading &&
            fredExternal.length === 0 &&
            wbExternal.length === 0 &&
            !externalNote ? (
              <p className="py-2 text-center text-[11px] text-fs-muted">无外部源匹配</p>
            ) : null}
          </div>
        ) : null}

        {catalogCountries &&
        !catalogError &&
        filteredCountries.length === 0 &&
        !isSearchMode ? (
          <p className="py-4 text-center text-xs text-fs-muted">无匹配项，请调整搜索词</p>
        ) : null}
        {catalogCountries &&
        !catalogError &&
        isSearchMode &&
        filteredCountries.length === 0 &&
        externalHits.length === 0 &&
        !externalLoading ? (
          <p className="py-4 text-center text-xs text-fs-muted">无匹配项，请调整搜索词</p>
        ) : null}
      </div>

      {variantTarget ? (
        <VariantPickerModal
          target={variantTarget}
          busy={Boolean(onboardingKey)}
          onCancel={() => setVariantTarget(null)}
          onConfirm={(choices) => {
            void confirmVariantPicker(choices);
          }}
        />
      ) : null}
    </div>
  );
}
