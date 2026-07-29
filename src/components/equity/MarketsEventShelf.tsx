"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CHANNEL_LABELS,
  COMPANY_KIND_FILTER_LABELS,
  COMPANY_KIND_FILTERS,
  isoDateToUnixSec,
  loadDemoMilestones,
  loadLocalCompanyEvents,
  marketEventToMilestone,
  mergeCompanyTimeline,
  milestoneMatchesCompanyKinds,
  milestoneToMarketEventDto,
  parseMilestoneIngestJson,
  saveLocalCompanyEvents,
  unixSecToIsoDate,
  type CompanyKindFilter,
  type CompanyMilestone,
} from "@/lib/equity/companyMilestones";
import { buildForChartUrl } from "@/lib/chart/buildForChartUrl";
import type { EventViewFilterState } from "@/lib/chart/eventViewFilters";
import { eventMatchesFilters } from "@/components/events/EventPanel";
import { EventPanelFilters } from "@/components/events/EventPanelFilters";
import { EventDetailDrawer } from "@/components/events/EventDetailDrawer";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import {
  eventTypeLabel,
  eventTypeMatchesFamilies,
  normalizeEventType,
} from "@/lib/data/eventTaxonomy";
import { isEraHeaderEvent } from "@/lib/data/marketEventTimeline";

const KIND_DOT: Record<CompanyMilestone["kind"], string> = {
  product: "bg-emerald-500",
  capacity: "bg-orange-400",
  policy: "bg-sky-500",
  sec: "bg-blue-600",
  deal: "bg-amber-600",
  other: "bg-slate-400",
};

const LAYER_BADGE: Record<CompanyMilestone["layer"], string> = {
  local: "本地",
  shared: "共享",
  sec: "SEC",
};

const TEMPLATE_BASE = "/templates/company-milestone";
const HEIGHT_STORAGE_KEY = "markets-event-shelf-height-v1";
const MIN_SHELF_HEIGHT = 180;
const MAX_SHELF_HEIGHT = 640;
const DEFAULT_SHELF_HEIGHT = 300;

function clampShelfHeight(h: number): number {
  return Math.min(MAX_SHELF_HEIGHT, Math.max(MIN_SHELF_HEIGHT, Math.round(h)));
}

function loadShelfHeight(fallback: number): number {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(HEIGHT_STORAGE_KEY);
    if (raw == null) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return clampShelfHeight(n);
  } catch {
    return fallback;
  }
}

function findNearestId(items: CompanyMilestone[], trackDate: string): string | null {
  if (!items.length) return null;
  const target = Date.parse(trackDate.slice(0, 10));
  if (!Number.isFinite(target)) return items[0]?.id ?? null;
  let best = items[0]!;
  let bestDist = Math.abs(Date.parse(best.occurredAt.slice(0, 10)) - target);
  for (const m of items) {
    const d = Math.abs(Date.parse(m.occurredAt.slice(0, 10)) - target);
    if (d < bestDist) {
      best = m;
      bestDist = d;
    }
  }
  return best.id;
}

export type MarketsEventShelfProps = {
  symbol: string;
  viewFilters: EventViewFilterState;
  onViewFiltersChange: (next: EventViewFilterState) => void;
  rangeFromSec?: number | null;
  rangeToSec?: number | null;
  trackDate?: string | null;
  onResetToSymbolDefault?: () => void;
  /** 初始高度；之后由面板内拖拽调节并写入 localStorage */
  height?: number;
};

export function MarketsEventShelf({
  symbol,
  viewFilters,
  onViewFiltersChange,
  rangeFromSec = null,
  rangeToSec = null,
  trackDate = null,
  onResetToSymbolDefault,
  height = DEFAULT_SHELF_HEIGHT,
}: MarketsEventShelfProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [shelfHeight, setShelfHeight] = useState(() =>
    loadShelfHeight(height),
  );
  const shelfHeightRef = useRef(shelfHeight);
  shelfHeightRef.current = shelfHeight;
  const [localOnly, setLocalOnly] = useState<CompanyMilestone[]>([]);
  const [sharedEvents, setSharedEvents] = useState<CompanyMilestone[]>([]);
  const [secEvents, setSecEvents] = useState<CompanyMilestone[]>([]);
  const [companyKindFilter, setCompanyKindFilter] = useState<
    CompanyKindFilter[]
  >(() =>
    viewFilters.typeFamilies.includes("company")
      ? [...COMPANY_KIND_FILTERS]
      : [],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userId, setUserId] = useState("anon");
  const [loading, setLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [drawerEvent, setDrawerEvent] = useState<MarketEventDto | null>(null);

  const onResizePointerDown = useCallback(
    (e: { preventDefault: () => void; clientY: number; pointerId: number; currentTarget: HTMLDivElement }) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = shelfHeightRef.current;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        setShelfHeight(clampShelfHeight(startH + (startY - ev.clientY)));
      };
      const onUp = (ev: PointerEvent) => {
        target.releasePointerCapture(ev.pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        try {
          localStorage.setItem(
            HEIGHT_STORAGE_KEY,
            String(shelfHeightRef.current),
          );
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [],
  );

  const sym = symbol.trim().toUpperCase();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as { user?: { id?: string } };
      })
      .then((j) => {
        if (cancelled) return;
        setUserId(j?.user?.id?.trim() || "anon");
      })
      .catch(() => {
        if (!cancelled) setUserId("anon");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const merged = useMemo(
    () => mergeCompanyTimeline(localOnly, sharedEvents, secEvents),
    [localOnly, sharedEvents, secEvents],
  );

  const visible = useMemo(() => {
    const companyOn = viewFilters.typeFamilies.includes("company");
    const order = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as const;
    const min = order[viewFilters.minImportance];
    let list = merged.filter((m) => order[m.importance] >= min);
    list = list.filter((m) =>
      eventTypeMatchesFamilies(m.eventType, viewFilters.typeFamilies),
    );
    if (companyOn && companyKindFilter.length > 0) {
      list = list.filter((m) => {
        const companyish =
          m.kind === "sec" ||
          m.kind === "product" ||
          m.kind === "capacity" ||
          m.kind === "deal" ||
          m.kind === "other" ||
          (normalizeEventType(m.eventType) ?? m.eventType).startsWith(
            "company.",
          );
        if (!companyish) return true;
        return milestoneMatchesCompanyKinds(m, companyKindFilter);
      });
    }
    const q = viewFilters.searchQ.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.content.toLowerCase().includes(q) ||
          m.impact.summary.toLowerCase().includes(q),
      );
    }
    if (rangeFromSec != null && rangeToSec != null) {
      const lo = Math.min(rangeFromSec, rangeToSec);
      const hi = Math.max(rangeFromSec, rangeToSec);
      list = list.filter((m) => {
        const t = isoDateToUnixSec(m.occurredAt);
        return t >= lo && t <= hi;
      });
    }
    return list;
  }, [
    merged,
    companyKindFilter,
    viewFilters.minImportance,
    viewFilters.searchQ,
    viewFilters.typeFamilies,
    rangeFromSec,
    rangeToSec,
  ]);

  useEffect(() => {
    setSelectedId((prev) => {
      if (prev && visible.some((m) => m.id === prev)) return prev;
      return visible[0]?.id ?? null;
    });
  }, [visible]);

  useEffect(() => {
    if (!trackDate || !visible.length) return;
    const id = findNearestId(visible, trackDate);
    if (id) setSelectedId(id);
  }, [trackDate, visible]);

  useEffect(() => {
    if (!selectedId) return;
    const root = scrollRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-mid="${selectedId.replace(/"/g, "")}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedId]);

  const filterFetchKey = useMemo(
    () =>
      JSON.stringify({
        scopeMode: viewFilters.scopeMode,
        includeSec: viewFilters.includeSec,
        includeMarket: viewFilters.includeMarket,
        minImportance: viewFilters.minImportance,
        typeFamilies: viewFilters.typeFamilies,
        assets: viewFilters.assets,
        industries: viewFilters.industries,
        countries: viewFilters.countries,
        persons: viewFilters.persons,
        institutions: viewFilters.institutions,
      }),
    [viewFilters],
  );

  useEffect(() => {
    if (!sym) {
      setLocalOnly([]);
      setSharedEvents([]);
      setSecEvents([]);
      return;
    }

    setLocalOnly(loadLocalCompanyEvents(userId, sym));

    const from =
      rangeFromSec != null
        ? unixSecToIsoDate(Math.min(rangeFromSec, rangeToSec ?? rangeFromSec))
        : "2000-01-01";
    const to =
      rangeToSec != null
        ? unixSecToIsoDate(Math.max(rangeToSec, rangeFromSec ?? rangeToSec))
        : new Date().toISOString().slice(0, 10);

    let cancelled = false;
    setLoading(true);
    const url = buildForChartUrl(sym, from, to, viewFilters);
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("fetch failed");
        return (await r.json()) as { events?: MarketEventDto[] };
      })
      .then((j) => {
        if (cancelled) return;
        const raw = (j.events ?? []).filter((e) => !isEraHeaderEvent(e));
        const filtered = raw.filter((e) =>
          eventMatchesFilters(e, viewFilters, {
            skipTagContext: true,
            fallbackAsset: sym,
          }),
        );
        const shared: CompanyMilestone[] = [];
        const sec: CompanyMilestone[] = [];
        for (const ev of filtered) {
          const layer = ev.sourceKind === "sec" ? "sec" : "shared";
          const m = marketEventToMilestone(ev, layer);
          if (!m) continue;
          if (layer === "sec") sec.push(m);
          else shared.push(m);
        }
        setSharedEvents(shared);
        setSecEvents(sec);
      })
      .catch(() => {
        if (!cancelled) {
          setSharedEvents([]);
          setSecEvents([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // viewFilters 经 filterFetchKey 稳定；searchQ 仅客户端筛
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [sym, userId, rangeFromSec, rangeToSec, filterFetchKey]);

  const selected = visible.find((m) => m.id === selectedId) ?? visible[0] ?? null;

  const applyLocalItems = useCallback(
    (nextLocal: CompanyMilestone[]) => {
      const withLayer = nextLocal.map((m) => ({ ...m, layer: "local" as const }));
      setLocalOnly(withLayer);
      if (sym) saveLocalCompanyEvents(userId, sym, withLayer);
    },
    [sym, userId],
  );

  const loadSample = useCallback(() => {
    if (!sym) return;
    applyLocalItems(loadDemoMilestones("TSLA"));
  }, [sym, applyLocalItems]);

  const onFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      try {
        const text = await file.text();
        const raw = JSON.parse(text) as unknown;
        const { milestones, errors } = parseMilestoneIngestJson(raw);
        if (errors.length && milestones.length === 0) return;
        applyLocalItems(milestones);
      } catch {
        /* ignore */
      }
      if (fileRef.current) fileRef.current.value = "";
    },
    [applyLocalItems],
  );

  const onSelect = useCallback((m: CompanyMilestone) => {
    setSelectedId(m.id);
  }, []);

  const localCount = localOnly.length;
  const minDate = visible[0]?.occurredAt;
  const maxDate = visible[visible.length - 1]?.occurredAt;

  return (
    <div
      className="relative flex shrink-0 flex-col border-t border-fs-border bg-fs-bg"
      style={{ height: shelfHeight }}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="拖动调节事件筛选器高度"
        title="上下拖动调节高度"
        onPointerDown={onResizePointerDown}
        className="absolute inset-x-0 top-0 z-10 flex h-2 cursor-ns-resize touch-none items-center justify-center hover:bg-fs-accent-soft/60"
      >
        <span className="h-0.5 w-10 rounded-full bg-fs-border" aria-hidden />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-fs-border px-2 py-1 pt-2.5">
        <span className="text-[11px] font-medium text-fs-text">事件筛选器</span>
        <span className="text-[10px] text-fs-muted">{sym || "未选标的"}</span>
        <label className="ml-1 flex cursor-pointer items-center gap-1 text-[10px] text-fs-muted">
          <input
            type="checkbox"
            checked={viewFilters.markersEnabled}
            onChange={(e) =>
              onViewFiltersChange({
                ...viewFilters,
                markersEnabled: e.target.checked,
              })
            }
            className="h-3 w-3"
          />
          图上显示
        </label>
        {onResetToSymbolDefault ? (
          <button
            type="button"
            onClick={onResetToSymbolDefault}
            className="rounded border border-fs-border px-1.5 py-0.5 text-[10px] text-fs-muted hover:bg-fs-elevated"
          >
            重置筛选
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className={`rounded border px-1.5 py-0.5 text-[10px] ${
            filtersOpen
              ? "border-fs-accent/40 bg-fs-accent-soft text-fs-accent-text"
              : "border-fs-border text-fs-muted hover:bg-fs-elevated"
          }`}
        >
          筛选
          {companyKindFilter.length > 0
            ? ` · ${companyKindFilter.map((k) => COMPANY_KIND_FILTER_LABELS[k]).join("+")}`
            : ""}
        </button>
        <span className="text-[10px] tabular-nums text-fs-muted">
          {visible.length} 条
          {localCount > 0 ? ` · 本地 ${localCount}` : ""}
          {loading ? " · …" : ""}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <a
            href={`${TEMPLATE_BASE}/company-milestone-pack.zip`}
            download="company-milestone-pack.zip"
            className="rounded border border-fs-accent/40 bg-white px-1.5 py-0.5 text-[10px] text-fs-accent-text hover:bg-fs-accent-soft"
            title="含说明、Skill、Schema、示例 JSON"
          >
            下载SKILL
          </a>
          <button
            type="button"
            onClick={loadSample}
            className="rounded bg-fs-accent-soft px-1.5 py-0.5 text-[10px] text-fs-accent-text hover:opacity-90"
          >
            载入 TSLA 范本
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="仅保存在本机当前账号；全站共享需管理员入库"
            className="rounded border border-fs-border px-1.5 py-0.5 text-[10px] text-fs-secondary hover:bg-fs-elevated"
          >
            导入经营事件
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      {filtersOpen ? (
        <div className="max-h-[160px] shrink-0 overflow-y-auto border-b border-fs-border px-2 py-1.5">
          <EventPanelFilters
            layout="shelf"
            filters={viewFilters}
            onChange={onViewFiltersChange}
            onResetToSymbolDefault={onResetToSymbolDefault}
            companyKindFilter={companyKindFilter}
            onCompanyKindFilterChange={setCompanyKindFilter}
          />
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        {visible.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-fs-muted">
            {!sym
              ? "请先在上方选择股票标的。"
              : merged.length > 0
                ? "当前筛选或可视区间内无事件，可调整筛选或拖动 K 线时间范围。"
                : "暂无事件。打开「筛选」调整类型，或「下载SKILL」后「导入经营事件」（仅本地可见）。"}
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="absolute inset-0 overflow-x-auto overflow-y-hidden px-2 py-1.5"
          >
            <div
              className="relative min-w-max"
              style={{ minWidth: Math.max(640, visible.length * 148) }}
            >
              <div className="mb-1 flex justify-between text-[9px] tabular-nums text-fs-muted">
                <span>{minDate?.slice(0, 10)}</span>
                <span>{maxDate?.slice(0, 10)}</span>
              </div>
              <div className="relative mx-2 h-px bg-fs-border" />
              <ul className="relative mt-1 flex items-stretch gap-2 pt-2">
                {visible.map((m) => {
                  const active = m.id === (selected?.id ?? selectedId);
                  return (
                    <li key={m.id} data-mid={m.id} className="w-[140px] shrink-0">
                      <button
                        type="button"
                        onClick={() => onSelect(m)}
                        onDoubleClick={() => setDrawerEvent(milestoneToMarketEventDto(m))}
                        className={`flex h-full w-full flex-col rounded border px-1.5 py-1 text-left transition ${
                          active
                            ? "border-fs-accent bg-fs-accent-soft shadow-sm"
                            : "border-fs-border bg-fs-elevated hover:border-fs-accent/40"
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${KIND_DOT[m.kind]}`}
                          />
                          <span className="text-[9px] tabular-nums text-fs-muted">
                            {m.occurredAt.slice(0, 7)}
                          </span>
                          <span className="ml-auto text-[8px] text-fs-muted">
                            {LAYER_BADGE[m.layer]}
                          </span>
                        </div>
                        <span className="mt-0.5 text-[9px] text-fs-muted">
                          {m.typeLabel || eventTypeLabel(m.eventType)}
                        </span>
                        <span
                          className={`mt-0.5 line-clamp-1 text-[10px] font-medium ${
                            active ? "text-fs-text" : "text-fs-secondary"
                          }`}
                        >
                          {m.markerLabel}
                        </span>
                        <span className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-fs-muted">
                          {m.title || m.impact.summary}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </div>

      {selected ? (
        <div className="shrink-0 border-t border-fs-border bg-fs-elevated/50 px-2 py-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[10px] tabular-nums text-fs-muted">
              {selected.occurredAt.slice(0, 10)}
            </span>
            <span className="text-[10px] text-fs-muted">{selected.typeLabel}</span>
            <span className="rounded bg-white px-1 text-[9px] text-fs-muted ring-1 ring-fs-border">
              {LAYER_BADGE[selected.layer]}
            </span>
            <span className="text-[11px] font-medium text-fs-text">{selected.title}</span>
            <button
              type="button"
              onClick={() => setDrawerEvent(milestoneToMarketEventDto(selected))}
              className="ml-auto text-[10px] text-fs-accent-text hover:underline"
            >
              详情
            </button>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-fs-secondary">
            {selected.impact.summary || selected.content}
          </p>
          {selected.impact.channels?.length ? (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {selected.impact.channels.map((c) => (
                <span
                  key={c}
                  className="rounded bg-white px-1 text-[9px] text-fs-muted ring-1 ring-fs-border"
                >
                  {CHANNEL_LABELS[c] ?? c}
                </span>
              ))}
            </div>
          ) : null}
          {selected.layer === "local" ? (
            <p className="mt-0.5 text-[9px] text-fs-muted">
              本地导入，仅对本账号可见；全站共享需管理员入库。
            </p>
          ) : null}
        </div>
      ) : null}

      <EventDetailDrawer
        event={drawerEvent}
        onClose={() => setDrawerEvent(null)}
      />
    </div>
  );
}
