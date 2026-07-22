"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CatalogTreeEditor } from "./CatalogTreeEditor";
import {
  COMPACT_DEFAULT_COLUMNS,
  SORT_COLUMNS,
  UnifiedCatalogTable,
  categoryExpandKey,
  filterCountry,
  subgroupExpandKey,
  type SortDir,
  type SortKey,
} from "./DataCatalogTableSection";
import type { AdminDataCatalogPayload } from "@/lib/data/scheduler/adminCatalog";
import {
  AcquisitionCell,
  BTN,
  BTN_PRIMARY,
  CalendarMappingPanel,
  CalendarSyncBadge,
  Drawer,
  FetchRunBadge,
  Pill,
  SourceLinks,
  SyncPackageButton,
  SyncReportPanel,
  formatDate,
  formatDateTime,
  formatValue,
  type DrawerKind,
  type SyncReport,
} from "./catalogAdminShared";
import { buildPackageSyncLeaders, collectAllIndicators } from "./catalogAdminUtils";

const tableDeps = {
  formatValue,
  formatDate,
  formatDateTime,
  SourceLinks,
  AcquisitionCell,
  CalendarSyncBadge,
  FetchRunBadge,
  SyncPackageButton,
};

export function DataCatalogAdminMain() {
  const [viewMode, setViewMode] = useState<"table" | "tree">("table");
  const [data, setData] = useState<AdminDataCatalogPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [onlySubscribed, setOnlySubscribed] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const [onlyStale, setOnlyStale] = useState(false);
  const [onlyIncompleteOnboarding, setOnlyIncompleteOnboarding] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [rowExpanded, setRowExpanded] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<SortKey>("label");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [compact, setCompact] = useState(true);
  const [visibleColumns, setVisibleColumns] = useState<Set<SortKey>>(
    () => new Set(COMPACT_DEFAULT_COLUMNS),
  );
  const [drawer, setDrawer] = useState<DrawerKind>(null);
  const [syncReport, setSyncReport] = useState<SyncReport | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [columnOpen, setColumnOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [fetchRuns, setFetchRuns] = useState<
    {
      instrumentCode: string;
      instrumentName?: string;
      status: string;
      startedAt: string;
      rowsUpserted: number;
      error: string | null;
      releasePackageId?: string | null;
      releasePackageLabelZh?: string | null;
      packageSyncId?: string | null;
    }[]
  >([]);

  const moreRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  const calendarWarning = useMemo(() => {
    if (!data) return false;
    return data.countries.some((c) =>
      c.categories.some((cat) =>
        [...cat.indicators, ...(cat.subgroups ?? []).flatMap((sg) => sg.indicators)].some(
          (i) =>
            i.networkAcquisitionConfirmed &&
            i.hasScheduledUpdates &&
            i.calendarSyncStatus != null &&
            i.calendarSyncStatus !== "matched" &&
            i.calendarSyncStatus !== "probe_only",
        ),
      ),
    );
  }, [data]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/data-catalog", { cache: "no-store" });
      const payload = (await res.json()) as AdminDataCatalogPayload & { error?: string };
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      setData(payload);
      const init: Record<string, boolean> = {};
      const defaultOpenCategories = new Set([
        "国民经济核算",
        "价格指数",
        "就业与工资",
        "采购经理人指数",
        "仅数据库（未在 FMP 统一目录）",
      ]);
      for (const c of payload.countries) {
        init[`country:${c.code}`] = c.code === "US" || c.code === "CN";
        for (const cat of c.categories) {
          const catKey = categoryExpandKey(c.code, cat.name);
          init[catKey] =
            (c.code === "US" || c.code === "CN") && defaultOpenCategories.has(cat.name);
          for (const sg of cat.subgroups ?? []) {
            const sgKey = subgroupExpandKey(c.code, cat.name, sg.name);
            init[sgKey] =
              (c.code === "US" || c.code === "CN") &&
              cat.name === "价格指数" &&
              sg.name === "CPI";
          }
        }
      }
      setExpanded(init);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (moreRef.current && !moreRef.current.contains(t)) setMoreOpen(false);
      if (columnRef.current && !columnRef.current.contains(t)) setColumnOpen(false);
      if (statsRef.current && !statsRef.current.contains(t)) setStatsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (compact) setVisibleColumns(new Set(COMPACT_DEFAULT_COLUMNS));
    else setVisibleColumns(new Set(SORT_COLUMNS.map((c) => c.key)));
  }, [compact]);

  useEffect(() => {
    if (syncReport) setDrawer("report");
  }, [syncReport]);

  const needle = q.trim().toLowerCase();
  const filteredCountries = useMemo(() => {
    if (!data) return [];
    return data.countries
      .map((country) =>
        filterCountry(
          country,
          needle,
          onlySubscribed,
          onlyPending,
          onlyStale,
          onlyIncompleteOnboarding,
        ),
      )
      .filter((c) => c.categories.length > 0);
  }, [data, needle, onlySubscribed, onlyPending, onlyStale, onlyIncompleteOnboarding]);

  const packageSyncLeaders = useMemo(
    () => buildPackageSyncLeaders(collectAllIndicators(filteredCountries)),
    [filteredCountries],
  );

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const open = prev[key] !== false;
      return { ...prev, [key]: !open };
    });
  const toggleRow = (key: string) => setRowExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const runAction = async (action: string) => {
    setBusy(action);
    setActionMsg(null);
    setMoreOpen(false);
    try {
      const res = await fetch("/api/admin/data-scheduler/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, force: action === "run_worker" }),
      });
      const body = (await res.json()) as SyncReport & { error?: string; details?: SyncReport["details"] };
      const report: SyncReport = {
        action,
        ok: res.ok,
        message: body.message ?? body.error ?? (res.ok ? "完成" : "失败"),
        details: body.details,
      };
      setActionMsg(report.message);
      if (action === "sync_all_stale" || action === "sync_one" || action === "sync_package") {
        setSyncReport(report);
      }
      if (res.ok) await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "请求失败");
    } finally {
      setBusy(null);
    }
  };

  const loadFetchRuns = async () => {
    const res = await fetch("/api/admin/data-scheduler/fetch-runs?limit=30", { cache: "no-store" });
    const payload = (await res.json()) as { rows?: typeof fetchRuns };
    setFetchRuns(payload.rows ?? []);
    setDrawer("runs");
  };

  const viewTab = (mode: "table" | "tree") =>
    `rounded px-2 py-0.5 text-xs ${
      viewMode === mode
        ? "bg-fs-elevated text-fs-text"
        : "text-fs-muted hover:bg-fs-elevated hover:text-fs-secondary"
    }`;

  return (
    <div className="flex h-[calc(100dvh-3.25rem)] min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-fs-border px-3 py-2 lg:px-4">
        <h1 className="text-base font-semibold text-fs-text">数据更新目录</h1>
        <button type="button" className={viewTab("table")} onClick={() => setViewMode("table")}>
          数据列表
        </button>
        <button type="button" className={viewTab("tree")} onClick={() => setViewMode("tree")}>
          编辑目录树
        </button>
        {data ? (
          <>
            <Pill tone="negative">未更新 {data.stats.staleCount}</Pill>
            <Pill tone="warning">待确定 {data.stats.fetchPending}</Pill>
            <Pill tone="neutral">已订阅 {data.stats.withSubscription}</Pill>
            <Pill tone="accent">可自动 {data.stats.readyCount}</Pill>
          </>
        ) : null}
        <div className="flex-1" />
        <div className="relative" ref={statsRef}>
          <button type="button" className={BTN} onClick={() => setStatsOpen((v) => !v)}>
            统计详情 ▾
          </button>
          {statsOpen && data ? (
            <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-md border border-fs-border bg-fs-bg p-3 text-xs text-fs-muted shadow-lg">
              <div className="space-y-1">
                <div>指标 {data.stats.totalIndicators}</div>
                <div>已入库 {data.stats.inDatabase}</div>
                <div>有最新值 {data.stats.withLatestValue}</div>
                <div>已确认获取 {data.stats.fetchKnown}</div>
                <div>源端暂无新值 {data.stats.sourceCurrentCount}</div>
                <div>仅数据库 {data.stats.dbOnlyCount}</div>
                <div className="pt-1 text-fs-secondary">更新于 {formatDateTime(data.builtAt)}</div>
              </div>
            </div>
          ) : null}
        </div>
        <button type="button" className={BTN} onClick={() => setDrawer("help")}>
          帮助
        </button>
        <button type="button" className={BTN} disabled={loading} onClick={() => load()}>
          {loading ? "刷新中…" : "刷新"}
        </button>
      </header>

      {viewMode === "table" ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-fs-border px-3 py-1.5 lg:px-4">
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={!!busy}
            onClick={() => runAction("sync_all_stale")}
          >
            {busy === "sync_all_stale" ? "更新中…" : "一键更新未更新"}
          </button>
          <button
            type="button"
            className={BTN}
            disabled={!!busy}
            onClick={() => runAction("sync_calendar")}
          >
            {busy === "sync_calendar" ? "同步中…" : "同步 TE 日历"}
          </button>
          <div className="relative" ref={moreRef}>
            <button type="button" className={BTN} onClick={() => setMoreOpen((v) => !v)}>
              更多操作 ▾
            </button>
            {moreOpen ? (
              <div className="absolute left-0 top-full z-30 mt-1 min-w-[10rem] rounded-md border border-fs-border bg-fs-bg py-1 text-xs shadow-lg">
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-fs-text hover:bg-fs-elevated"
                  disabled={!!busy}
                  onClick={() => runAction("run_worker")}
                >
                  跑到期任务
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-fs-text hover:bg-fs-elevated"
                  disabled={!!busy}
                  onClick={() => runAction("probe_overview")}
                >
                  探测数据源
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-fs-text hover:bg-fs-elevated"
                  onClick={() => loadFetchRuns()}
                >
                  最近拉取日志
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-fs-text hover:bg-fs-elevated"
                  onClick={() => setDrawer("calendar")}
                >
                  日历映射
                </button>
              </div>
            ) : null}
          </div>
          <div className="hidden h-5 w-px bg-fs-border sm:block" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索指标、代码、fred/mds 键…"
            className="min-w-[140px] flex-1 rounded border border-fs-border bg-fs-bg px-2 py-1 text-xs text-fs-text placeholder:text-fs-muted"
          />
          <label className="flex cursor-pointer items-center gap-1 text-xs text-fs-muted">
            <input
              type="checkbox"
              checked={onlyStale}
              onChange={(e) => setOnlyStale(e.target.checked)}
              className="rounded border-fs-border"
            />
            仅未更新
          </label>
          <label className="hidden cursor-pointer items-center gap-1 text-xs text-fs-muted sm:flex">
            <input
              type="checkbox"
              checked={onlyPending}
              onChange={(e) => setOnlyPending(e.target.checked)}
              className="rounded border-fs-border"
            />
            仅待确定
          </label>
          <label className="hidden cursor-pointer items-center gap-1 text-xs text-fs-muted md:flex">
            <input
              type="checkbox"
              checked={onlyIncompleteOnboarding}
              onChange={(e) => setOnlyIncompleteOnboarding(e.target.checked)}
              className="rounded border-fs-border"
            />
            待完善
          </label>
          <label className="hidden cursor-pointer items-center gap-1 text-xs text-fs-muted md:flex">
            <input
              type="checkbox"
              checked={onlySubscribed}
              onChange={(e) => setOnlySubscribed(e.target.checked)}
              className="rounded border-fs-border"
            />
            已订阅
          </label>
          <div className="relative" ref={columnRef}>
            <button type="button" className={BTN} onClick={() => setColumnOpen((v) => !v)}>
              列
            </button>
            {columnOpen ? (
              <div className="absolute right-0 top-full z-30 mt-1 w-40 rounded-md border border-fs-border bg-fs-bg p-2 text-xs shadow-lg">
                {SORT_COLUMNS.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 py-0.5 text-fs-muted">
                    <input
                      type="checkbox"
                      checked={visibleColumns.has(c.key)}
                      onChange={(e) => {
                        setVisibleColumns((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(c.key);
                          else if (next.size > 2) next.delete(c.key);
                          return next;
                        });
                        setCompact(false);
                      }}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={`${BTN} ${compact ? "border-emerald-800/50 text-emerald-300" : ""}`}
            onClick={() => setCompact((v) => !v)}
          >
            {compact ? "紧凑" : "标准"}
          </button>
        </div>
      ) : null}

      {actionMsg ? (
        <div className="shrink-0 border-b border-fs-border bg-fs-elevated/50 px-4 py-1 text-xs text-fs-muted">
          {actionMsg}
        </div>
      ) : null}

      {error ? (
        <div className="mx-3 mt-2 shrink-0 rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden px-2 pb-2 pt-1 lg:px-3">
        {viewMode === "tree" ? (
          <div className="h-full overflow-auto rounded-lg border border-fs-border bg-fs-elevated p-3">
            <CatalogTreeEditor onSaved={() => load()} />
          </div>
        ) : loading && !data ? (
          <p className="p-4 text-sm text-fs-muted">加载中…</p>
        ) : filteredCountries.length > 0 ? (
          <div className="h-full overflow-auto rounded-lg border border-fs-border bg-fs-elevated">
            <UnifiedCatalogTable
              countries={filteredCountries}
              expanded={expanded}
              rowExpanded={rowExpanded}
              onToggle={toggle}
              onToggleRow={toggleRow}
              onRefresh={() => load()}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              packageSyncLeaders={packageSyncLeaders}
              onSyncReport={setSyncReport}
              visibleColumns={visibleColumns}
              compact={compact}
              deps={tableDeps}
            />
          </div>
        ) : (
          <p className="p-4 text-sm text-fs-muted">无匹配指标</p>
        )}
      </div>

      <Drawer open={drawer === "help"} title="帮助与命令行" onClose={() => setDrawer(null)}>
        <div className="space-y-3 text-xs leading-relaxed text-fs-muted">
          <p>
            <strong className="text-fs-secondary">待确定</strong>：尚未确认网络获取方式；下次更新与更新计划为空。
          </p>
          <p>
            <strong className="text-fs-accent-text">已确认获取</strong> 后才会出现调度状态与下次更新时间。
          </p>
          <p>
            计划任务：每小时 <code>npm run data:sync-calendar</code>，每 1–5 分钟{" "}
            <code>npm run data:worker</code>
          </p>
          <p>探测：<code>npm run data:probe-sources</code></p>
          <p>未更新批量：<code>npm run data:sync-all-stale</code></p>
          <p>行左侧 ▸ 可展开查看来源、获取方式、更新计划等详情。</p>
          {calendarWarning ? (
            <p className="text-amber-400">
              部分订阅 TE 日历未对齐。可配置 TE_CALENDAR_COOKIE 后点「同步 TE 日历」。
            </p>
          ) : null}
          {data && data.stats.staleCount > 0 ? (
            <p className="text-fs-negative/90">当前有 {data.stats.staleCount} 条指标未更新。</p>
          ) : null}
        </div>
      </Drawer>

      <Drawer
        open={drawer === "report" && syncReport != null}
        title="同步报告"
        onClose={() => {
          setDrawer(null);
          setSyncReport(null);
        }}
      >
        {syncReport ? (
          <SyncReportPanel
            report={syncReport}
            onClose={() => {
              setDrawer(null);
              setSyncReport(null);
            }}
          />
        ) : null}
      </Drawer>

      <Drawer open={drawer === "runs"} title="最近拉取日志" onClose={() => setDrawer(null)}>
        <ul className="space-y-2 text-xs text-fs-muted">
          {fetchRuns.map((r) => (
            <li key={`${r.instrumentCode}-${r.startedAt}`}>
              <span className="font-mono text-fs-secondary">{r.instrumentCode}</span> {r.status} +{r.rowsUpserted}{" "}
              · {formatDateTime(r.startedAt)}
              {r.releasePackageLabelZh ? (
                <span className="text-fs-secondary"> · 包 {r.releasePackageLabelZh}</span>
              ) : null}
              {r.packageSyncId ? (
                <span className="text-fs-muted" title={r.packageSyncId}>
                  {" "}
                  · 批次 {r.packageSyncId.slice(0, 8)}
                </span>
              ) : null}
              {r.error ? <span className="text-fs-negative"> · {r.error}</span> : null}
            </li>
          ))}
          {fetchRuns.length === 0 ? <li>暂无记录</li> : null}
        </ul>
      </Drawer>

      <Drawer open={drawer === "calendar"} title="日历映射" onClose={() => setDrawer(null)}>
        <CalendarMappingPanel onClose={() => setDrawer(null)} />
      </Drawer>
    </div>
  );
}
