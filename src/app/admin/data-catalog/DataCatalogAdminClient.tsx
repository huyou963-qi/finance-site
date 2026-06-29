"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { CatalogTreeEditor } from "./CatalogTreeEditor";
import type {
  AdminCatalogCountry,
  AdminCatalogIndicator,
  AdminDataCatalogPayload,
} from "@/lib/data/scheduler/adminCatalog";

function formatValue(value: number | null, unit: string | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  const s = value.toLocaleString("zh-CN", { maximumFractionDigits: digits });
  return unit ? `${s} ${unit}` : s;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function CalendarSyncBadge({ status }: { status: string }) {
  const label =
    status === "matched"
      ? "日历已对齐"
      : status === "fetch_failed"
        ? "日历拉取失败"
        : status === "no_match"
          ? "日历未匹配"
          : status === "probe_only"
            ? "固定探测"
            : status === "no_mapping"
              ? "无日历映射"
              : "未同步";
  const cls =
    status === "matched"
      ? "text-emerald-500/90"
      : status === "fetch_failed" || status === "no_match"
        ? "text-amber-400"
        : "text-slate-500";
  return <div className={`mt-1 ${cls}`}>{label}</div>;
}

function FetchRunBadge({ row }: { row: AdminCatalogIndicator }) {
  if (!row.lastFetchStatus) return null;
  const ok = row.lastFetchStatus === "SUCCESS" || row.lastFetchStatus === "SKIPPED";
  return (
    <div className={`mt-1 ${ok ? "text-slate-500" : "text-red-400"}`}>
      最近拉取 {row.lastFetchStatus}
      {row.lastFetchAt ? ` · ${formatDateTime(row.lastFetchAt)}` : ""}
      {row.lastFetchUpserted != null ? ` · +${row.lastFetchUpserted}` : ""}
    </div>
  );
}

function SchedulerToolbar({
  onDone,
  onShowRuns,
  onShowCalendar,
}: {
  onDone: () => void;
  onShowRuns: () => void;
  onShowCalendar: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async (action: string, extra?: Record<string, unknown>) => {
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/data-scheduler/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, force: action.startsWith("run_worker"), ...extra }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      setMsg(data.message ?? data.error ?? (res.ok ? "完成" : "失败"));
      if (res.ok) onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "请求失败");
    } finally {
      setBusy(null);
    }
  };

  const btn =
    "rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50";

  return (
    <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="shrink-0 text-sm font-medium text-slate-200">调度操作</div>
        <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-2">
          <button type="button" className={btn} disabled={!!busy} onClick={() => run("sync_calendar")}>
            {busy === "sync_calendar" ? "同步中…" : "同步 TE 日历"}
          </button>
          <button type="button" className={btn} disabled={!!busy} onClick={() => run("sync_all_stale")}>
            {busy === "sync_all_stale" ? "更新中…" : "一键更新未更新指标"}
          </button>
          <button type="button" className={btn} disabled={!!busy} onClick={() => run("run_worker")}>
            {busy === "run_worker" ? "运行中…" : "跑到期任务"}
          </button>
          <button type="button" className={btn} disabled={!!busy} onClick={() => run("probe_overview")}>
            {busy === "probe_overview" ? "探测中…" : "探测数据源"}
          </button>
          <button type="button" className={btn} disabled={!!busy} onClick={onShowRuns}>
            最近拉取日志
          </button>
          <button type="button" className={btn} disabled={!!busy} onClick={onShowCalendar}>
            日历映射
          </button>
        </div>
      </div>
      {msg ? <p className="text-xs text-slate-400">{msg}</p> : null}
    </div>
  );
}

type CalendarMappingPayload = {
  builtIn: Record<string, { countryCodes: string[]; keywords: string[] }>;
  overrides: Record<
    string,
    { countryCodes: string[]; keywords: string[]; excludeKeywords?: string[]; updatedAt?: string }
  >;
};

function CalendarMappingPanel({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<CalendarMappingPayload | null>(null);
  const [fredKey, setFredKey] = useState("CPIAUCSL");
  const [countries, setCountries] = useState("US");
  const [keywords, setKeywords] = useState("consumer price index,cpi m/m");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/data-scheduler/calendar-mappings", { cache: "no-store" });
    const payload = (await res.json()) as CalendarMappingPayload;
    setData(payload);
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const save = async () => {
    setMsg(null);
    const res = await fetch("/api/admin/data-scheduler/calendar-mappings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fredKey,
        spec: {
          countryCodes: countries.split(/[,，\s]+/).filter(Boolean),
          keywords: keywords.split(/[,，]+/).map((s) => s.trim()).filter(Boolean),
        },
      }),
    });
    const body = (await res.json()) as { error?: string };
    setMsg(res.ok ? "已保存覆盖规则" : body.error ?? "保存失败");
    if (res.ok) load();
  };

  const overrideKeys = data ? Object.keys(data.overrides) : [];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-slate-200">TradingEconomics 日历映射（覆盖内置）</span>
        <button type="button" className="text-slate-500 hover:text-slate-300" onClick={onClose}>
          关闭
        </button>
      </div>
      <p className="mb-2 text-slate-500">
        内置 {data ? Object.keys(data.builtIn).length : "…"} 条；覆盖 {overrideKeys.length} 条。保存后
        `npm run data:sync-calendar` 生效。
      </p>
      {overrideKeys.length > 0 ? (
        <ul className="mb-2 max-h-24 space-y-0.5 overflow-y-auto text-slate-400">
          {overrideKeys.map((k) => (
            <li key={k}>
              <span className="font-mono text-slate-500">{k}</span>{" "}
              {data!.overrides[k]!.keywords.join(" · ")}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="text-slate-500">FRED 键</span>
          <input
            value={fredKey}
            onChange={(e) => setFredKey(e.target.value)}
            className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
          />
        </label>
        <label className="block">
          <span className="text-slate-500">国家代码</span>
          <input
            value={countries}
            onChange={(e) => setCountries(e.target.value)}
            className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
          />
        </label>
        <label className="block sm:col-span-1">
          <span className="text-slate-500">关键词（逗号分隔）</span>
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
          />
        </label>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={save}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 hover:bg-slate-800"
        >
          保存覆盖
        </button>
      </div>
      {msg ? <p className="mt-2 text-slate-400">{msg}</p> : null}
    </div>
  );
}

function AcquisitionCell({ row }: { row: AdminCatalogIndicator }) {
  if (!row.networkAcquisitionConfirmed) {
    return (
      <div>
        <span className="text-amber-400">待确定</span>
        <div className="mt-0.5 text-slate-500">
          {!row.inDatabase
            ? "目录项尚未入库，须先入库并确认网络获取方式"
            : "须确认网络获取方式（FRED / BIS / REST 等）并探测通过"}
        </div>
        {row.fetchAcquisitionMessage ? (
          <div className="mt-0.5 text-slate-600" title={row.fetchAcquisitionMessage}>
            {row.fetchAcquisitionMessage}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <span className="text-emerald-400">已确认获取</span>
      {row.fetchAcquisitionMethod ? (
        <div className="mt-0.5 font-medium text-slate-300">{row.fetchAcquisitionMethod}</div>
      ) : null}
      {row.fetchAcquisitionFetchUrl ? (
        <a
          href={row.fetchAcquisitionFetchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 block break-all text-sky-400/90 hover:underline"
        >
          API 请求示例
        </a>
      ) : null}
      {row.fetchAcquisitionMessage ? (
        <div className="mt-0.5 text-slate-500" title={row.fetchAcquisitionMessage}>
          {row.fetchAcquisitionMessage}
        </div>
      ) : null}
      {row.fetchAcquisitionProbedAt ? (
        <div className="mt-0.5 text-slate-600">探测 {formatDate(row.fetchAcquisitionProbedAt)}</div>
      ) : null}
    </div>
  );
}

function SourceLinks({ row }: { row: AdminCatalogIndicator }) {
  const primary = row.sourcePageUrl;
  const api = row.apiSourceUrl;
  if (!primary && !api) return <span className="text-slate-500">—</span>;
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      {primary ? (
        <a
          href={primary}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-400 hover:text-emerald-300 hover:underline"
        >
          官方 / 发布页
        </a>
      ) : null}
      {api ? (
        <a
          href={api}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-400 hover:text-sky-300 hover:underline"
        >
          数据源 API
        </a>
      ) : null}
      {row.agencyName ? (
        <span className="text-slate-500">
          {row.agencyWebsiteUrl ? (
            <a
              href={row.agencyWebsiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-300 hover:underline"
            >
              {row.agencyName}
            </a>
          ) : (
            row.agencyName
          )}
        </span>
      ) : null}
      {row.sourceName ? (
        <span className="text-slate-600">{row.sourceName}</span>
      ) : null}
    </div>
  );
}

function SyncOneButton({ code, onDone }: { code: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="mt-1 block text-sky-400 hover:underline disabled:opacity-50"
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/admin/data-scheduler/actions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "sync_one", instrumentCode: code }),
          });
          onDone();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "同步中…" : "立即同步"}
    </button>
  );
}

function IndicatorRow({ row, onRefresh }: { row: AdminCatalogIndicator; onRefresh: () => void }) {
  const router = useRouter();

  const openInMacro = (e: MouseEvent<HTMLTableRowElement>) => {
    if ((e.target as HTMLElement).closest("button, a")) return;
    router.push(`/macro?key=${encodeURIComponent(row.key)}&replace=1`);
  };

  return (
    <tr
      className="cursor-pointer border-b border-slate-900/80 align-top text-xs hover:bg-slate-900/40"
      title="双击在宏观页查看"
      onDoubleClick={openInMacro}
    >
      <td className="py-1.5 pl-12 pr-3">
        <div className="text-xs text-slate-200">{row.label}</div>
        <div className="mt-0.5 font-mono text-[10px] text-slate-500">{row.key}</div>
        {row.instrumentCode ? (
          <div className="font-mono text-[10px] text-slate-600">{row.instrumentCode}</div>
        ) : null}
        {row.releasePackageLabelZh ? (
          <div className="mt-0.5 text-[10px] text-sky-500">发布包：{row.releasePackageLabelZh}</div>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-slate-400">{row.frequency}</td>
      <td className="px-3 py-1.5 text-slate-300">
        {row.dbSource ?? <span className="text-slate-500">—</span>}
      </td>
      <td className="px-3 py-1.5">
        <SourceLinks row={row} />
      </td>
      <td className="px-3 py-1.5">
        <AcquisitionCell row={row} />
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-slate-300">
        {formatValue(row.latestValue, row.unit)}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-slate-400">
        {formatDate(row.latestObsDate)}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-slate-400">
        {row.networkAcquisitionConfirmed ? formatDateTime(row.nextRunAt) : "—"}
      </td>
      <td className="px-3 py-1.5 text-slate-500">
        {row.networkAcquisitionConfirmed ? (
          <>
            <div>{row.releaseRuleSummary ?? "—"}</div>
            {row.calendarReleaseAt ? (
              <div className="mt-1 text-slate-500">
                日历发布 {formatDateTime(row.calendarReleaseAt)}
                {row.calendarEventTitle ? (
                  <span className="block truncate" title={row.calendarEventTitle}>
                    {row.calendarEventTitle}
                  </span>
                ) : null}
              </div>
            ) : null}
            {row.calendarSyncStatus ? (
              <CalendarSyncBadge status={row.calendarSyncStatus} />
            ) : null}
          </>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-1.5">
        {!row.networkAcquisitionConfirmed ? (
          <span className="text-amber-400">待确定</span>
        ) : row.isStale ? (
          <span className="text-red-400">未更新</span>
        ) : row.updateStatus === "source_current" ? (
          <span className="text-slate-400">源端暂无新值</span>
        ) : row.updateStatus === "on_schedule" ? (
          <span className="text-emerald-400">等待下次更新</span>
        ) : (
          <span className="text-slate-500">—</span>
        )}
        {row.networkAcquisitionConfirmed && row.staleReason ? (
          <div
            className={`mt-0.5 ${
              row.updateStatus === "source_current" ? "text-slate-500" : "text-red-400/90"
            }`}
            title={row.staleReason}
          >
            {row.staleReason}
          </div>
        ) : null}
        {row.networkAcquisitionConfirmed && row.lastError ? (
          <div className="mt-1 truncate text-red-400" title={row.lastError}>
            {row.lastError}
          </div>
        ) : null}
        {row.networkAcquisitionConfirmed ? <FetchRunBadge row={row} /> : null}
        {row.networkAcquisitionConfirmed && row.instrumentCode ? (
          <SyncOneButton code={row.instrumentCode} onDone={onRefresh} />
        ) : null}
      </td>
    </tr>
  );
}

const COL_COUNT = 10;

type SortKey =
  | "label"
  | "frequency"
  | "dbSource"
  | "sourceLink"
  | "acquisition"
  | "latestValue"
  | "latestObsDate"
  | "nextRunAt"
  | "releasePlan"
  | "status";

type SortDir = "asc" | "desc";

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "label", label: "指标" },
  { key: "frequency", label: "频度" },
  { key: "dbSource", label: "库内来源" },
  { key: "sourceLink", label: "数据源链接" },
  { key: "acquisition", label: "获取方式" },
  { key: "latestValue", label: "最新值" },
  { key: "latestObsDate", label: "最新日期" },
  { key: "nextRunAt", label: "下次更新" },
  { key: "releasePlan", label: "更新计划" },
  { key: "status", label: "状态" },
];

function acquisitionSortKey(row: AdminCatalogIndicator): string {
  if (row.networkAcquisitionConfirmed) {
    return `0${row.fetchAcquisitionMethod ?? "已确认"}`;
  }
  return "1待确定";
}

function statusSortKey(row: AdminCatalogIndicator): string {
  if (!row.networkAcquisitionConfirmed) return "0待确定";
  if (row.isStale) return "3未更新";
  if (row.updateStatus === "source_current") return "2源端暂无新值";
  if (row.updateStatus === "on_schedule") return "1等待下次更新";
  return "4";
}

function sourceLinkSortKey(row: AdminCatalogIndicator): string {
  return (row.agencyName ?? row.sourceName ?? row.sourcePageUrl ?? row.apiSourceUrl ?? "").toLowerCase();
}

function compareNullableString(a: string | null | undefined, b: string | null | undefined): number {
  const sa = (a ?? "").toLowerCase();
  const sb = (b ?? "").toLowerCase();
  if (!sa && !sb) return 0;
  if (!sa) return 1;
  if (!sb) return -1;
  return sa.localeCompare(sb, "zh-CN");
}

function compareNullableNumber(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function compareNullableDate(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function compareIndicators(a: AdminCatalogIndicator, b: AdminCatalogIndicator, key: SortKey): number {
  switch (key) {
    case "label":
      return compareNullableString(a.label, b.label);
    case "frequency":
      return compareNullableString(a.frequency, b.frequency);
    case "dbSource":
      return compareNullableString(a.dbSource, b.dbSource);
    case "sourceLink":
      return compareNullableString(sourceLinkSortKey(a), sourceLinkSortKey(b));
    case "acquisition":
      return compareNullableString(acquisitionSortKey(a), acquisitionSortKey(b));
    case "latestValue":
      return compareNullableNumber(a.latestValue, b.latestValue);
    case "latestObsDate":
      return compareNullableDate(a.latestObsDate, b.latestObsDate);
    case "nextRunAt":
      return compareNullableDate(a.nextRunAt, b.nextRunAt);
    case "releasePlan":
      return compareNullableString(a.releaseRuleSummary, b.releaseRuleSummary);
    case "status":
      return compareNullableString(statusSortKey(a), statusSortKey(b));
    default:
      return 0;
  }
}

function sortIndicators(
  rows: AdminCatalogIndicator[],
  key: SortKey,
  dir: SortDir,
): AdminCatalogIndicator[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => compareIndicators(a, b, key) * mul);
}

function categoryExpandKey(countryCode: string, categoryName: string): string {
  return `category:${countryCode}:${categoryName}`;
}

function subgroupExpandKey(countryCode: string, categoryName: string, subgroupName: string): string {
  return `subgroup:${countryCode}:${categoryName}:${subgroupName}`;
}

function categoryIndicatorCount(cat: AdminCatalogCountry["categories"][number]): number {
  const sub = (cat.subgroups ?? []).reduce((n, sg) => n + sg.indicators.length, 0);
  return cat.indicators.length + sub;
}

function countryIndicatorCount(country: AdminCatalogCountry): number {
  return country.categories.reduce((n, cat) => n + categoryIndicatorCount(cat), 0);
}

function CatalogTableHeader({
  sortKey,
  sortDir,
  onSort,
}: {
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  return (
    <thead className="sticky top-0 z-20 bg-slate-950 text-xs text-slate-500 shadow-[0_1px_0_0_rgb(51_65_85)]">
      <tr className="border-b border-slate-700">
        {SORT_COLUMNS.map((col) => {
          const active = sortKey === col.key;
          return (
            <th key={col.key} className="px-3 py-2 text-left font-medium">
              <button
                type="button"
                onClick={() => onSort(col.key)}
                className={`inline-flex items-center gap-1 hover:text-slate-200 ${
                  active ? "text-slate-200" : ""
                }`}
              >
                {col.label}
                <span className="text-[10px] text-slate-600">
                  {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                </span>
              </button>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

function UnifiedCatalogTable({
  countries,
  expanded,
  onToggle,
  onRefresh,
  sortKey,
  sortDir,
  onSort,
}: {
  countries: AdminCatalogCountry[];
  expanded: Record<string, boolean>;
  onToggle: (key: string) => void;
  onRefresh: () => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  return (
    <div className="max-h-[min(72vh,900px)] overflow-auto rounded-lg border border-slate-800 bg-slate-950/50">
      <table className="w-full min-w-[1100px] table-fixed text-left text-sm">
        <colgroup>
          <col className="w-[22%]" />
          <col className="w-[5%]" />
          <col className="w-[8%]" />
          <col className="w-[10%]" />
          <col className="w-[14%]" />
          <col className="w-[8%]" />
          <col className="w-[8%]" />
          <col className="w-[9%]" />
          <col className="w-[10%]" />
          <col className="w-[8%]" />
        </colgroup>
        <CatalogTableHeader sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
        <tbody>
          {countries.map((country) => {
            const countryKey = `country:${country.code}`;
            const countryOpen = expanded[countryKey] !== false;
            const totalCount = countryIndicatorCount(country);
            return (
              <Fragment key={country.code}>
                <tr className="bg-slate-900/60">
                  <td colSpan={COL_COUNT} className="p-0">
                    <button
                      type="button"
                      onClick={() => onToggle(countryKey)}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-900/80"
                    >
                      <span className="font-medium text-slate-100">
                        {country.name}
                        <span className="ml-2 text-sm font-normal text-slate-500">{country.code}</span>
                      </span>
                      <span className="text-sm text-slate-500">
                        {totalCount} 项 {countryOpen ? "▾" : "▸"}
                      </span>
                    </button>
                  </td>
                </tr>
                {countryOpen
                  ? country.categories.map((cat) => {
                      const catKey = categoryExpandKey(country.code, cat.name);
                      const catOpen = expanded[catKey] !== false;
                      const catCount = categoryIndicatorCount(cat);
                      if (catCount === 0) return null;
                      return (
                        <Fragment key={catKey}>
                          <tr className="bg-slate-900/35">
                            <td colSpan={COL_COUNT} className="p-0">
                              <button
                                type="button"
                                onClick={() => onToggle(catKey)}
                                className="flex w-full items-center justify-between py-2 pl-8 pr-4 text-left hover:bg-slate-900/50"
                              >
                                <span className="text-sm font-medium text-slate-300">{cat.name}</span>
                                <span className="text-xs text-slate-500">
                                  {catCount} 项 {catOpen ? "▾" : "▸"}
                                </span>
                              </button>
                            </td>
                          </tr>
                          {catOpen ? (
                            <>
                              {cat.indicators.length > 0
                                ? sortIndicators(cat.indicators, sortKey, sortDir).map((row) => (
                                    <IndicatorRow key={row.key} row={row} onRefresh={onRefresh} />
                                  ))
                                : null}
                              {(cat.subgroups ?? []).map((sg) => {
                                const sgKey = subgroupExpandKey(country.code, cat.name, sg.name);
                                const sgOpen = expanded[sgKey] !== false;
                                const indicators = sortIndicators(sg.indicators, sortKey, sortDir);
                                if (!indicators.length) return null;
                                return (
                                  <Fragment key={sgKey}>
                                    <tr className="bg-slate-900/20">
                                      <td colSpan={COL_COUNT} className="p-0">
                                        <button
                                          type="button"
                                          onClick={() => onToggle(sgKey)}
                                          className="flex w-full items-center justify-between py-1.5 pl-12 pr-4 text-left hover:bg-slate-900/40"
                                        >
                                          <span className="text-xs font-medium text-slate-400">{sg.name}</span>
                                          <span className="text-xs text-slate-500">
                                            {indicators.length} 项 {sgOpen ? "▾" : "▸"}
                                          </span>
                                        </button>
                                      </td>
                                    </tr>
                                    {sgOpen
                                      ? indicators.map((row) => (
                                          <IndicatorRow key={row.key} row={row} onRefresh={onRefresh} />
                                        ))
                                      : null}
                                  </Fragment>
                                );
                              })}
                            </>
                          ) : null}
                        </Fragment>
                      );
                    })
                  : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DataSchedulerInfoCard({
  open,
  onToggle,
  calendarWarning,
  staleCount,
  sourceCurrentCount,
}: {
  open: boolean;
  onToggle: () => void;
  calendarWarning: boolean;
  staleCount: number;
  sourceCurrentCount: number;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/80">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-900/50"
      >
        <span className="text-sm font-medium text-slate-100">数据更新机制（通用）</span>
        <span className="text-xs text-slate-500">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="border-t border-slate-800 px-4 py-3 text-xs leading-relaxed text-slate-400">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="font-normal text-slate-300">待确定</strong>：尚未确认网络获取方式（含<strong className="font-normal text-slate-300">仅目录未入库</strong>、Excel 历史导入、未探测等）。此时<strong className="font-normal text-slate-300">下次更新 / 更新计划</strong>为空；<strong className="font-normal text-slate-300">状态</strong>亦显示待确定。
            </li>
            <li>
              <strong className="font-normal text-emerald-400/90">已确认获取</strong> 后才会出现下次更新、更新计划，以及等待下次更新 / 未更新 / 源端暂无新值等调度状态。
            </li>
          </ol>
          <p className="mt-3">
            计划任务建议：每小时 <code className="text-slate-300">npm run data:sync-calendar</code>，每 1–5 分钟{" "}
            <code className="text-slate-300">npm run data:worker</code>。
          </p>
          <p className="mt-2">
            Excel 导入：
            <code className="text-slate-300">
              npm run db:import-macro-xlsx -- --file=路径.xlsx --preset=debtcap
            </code>
            （指标树：国家宏观 → 国家 → 主题 → 指标 → 子维度）
          </p>
          {staleCount > 0 ? (
            <p className="mt-2 text-red-400/90">当前有 {staleCount} 条指标未更新（到期且本地尚未确认同步）。</p>
          ) : null}
          {sourceCurrentCount > 0 ? (
            <p className="mt-2 text-slate-500">
              另有 {sourceCurrentCount} 条已同步至源端最新，源端尚未发布更晚数据。
            </p>
          ) : null}
          {calendarWarning ? (
            <p className="mt-2 text-amber-400">
              部分订阅 TE 日历未对齐。可配置 TE_CALENDAR_COOKIE 后点「同步 TE 日历」。
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}


export function DataCatalogAdminClient() {
  const [viewMode, setViewMode] = useState<"table" | "tree">("table");
  const [data, setData] = useState<AdminDataCatalogPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [onlySubscribed, setOnlySubscribed] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const [onlyStale, setOnlyStale] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<SortKey>("label");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [fetchRuns, setFetchRuns] = useState<
    { instrumentCode: string; status: string; startedAt: string; rowsUpserted: number; error: string | null }[]
  >([]);
  const [showRuns, setShowRuns] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [schedulerInfoOpen, setSchedulerInfoOpen] = useState(false);

  const calendarWarning = useMemo(() => {
    if (!data) return false;
    return data.countries.some((c) =>
      c.categories.some((cat) =>
        cat.indicators.some(
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
      ]);
      for (const c of payload.countries) {
        init[`country:${c.code}`] = c.code === "CN" || c.code === "US";
        for (const cat of c.categories) {
          const catKey = categoryExpandKey(c.code, cat.name);
          init[catKey] =
            (c.code === "CN" || c.code === "US") && defaultOpenCategories.has(cat.name);
          for (const sg of cat.subgroups ?? []) {
            const sgKey = subgroupExpandKey(c.code, cat.name, sg.name);
            init[sgKey] =
              (c.code === "CN" || c.code === "US") &&
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

  const filteredCountries = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.countries
      .map((country) => filterCountry(country, needle, onlySubscribed, onlyPending, onlyStale))
      .filter((c) => c.categories.length > 0);
  }, [data, q, onlySubscribed, onlyPending, onlyStale]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const open = prev[key] !== false;
      return { ...prev, [key]: !open };
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const loadFetchRuns = useCallback(async () => {
    const res = await fetch("/api/admin/data-scheduler/fetch-runs?limit=30", { cache: "no-store" });
    const payload = (await res.json()) as { rows?: typeof fetchRuns };
    setFetchRuns(payload.rows ?? []);
    setShowRuns(true);
  }, []);

  return (
    <div className="w-full min-w-0 space-y-4 px-4 py-4 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
          <h1 className="shrink-0 text-xl font-semibold text-slate-50">数据更新目录</h1>
          {data ? (
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400">
              <span>指标 {data.stats.totalIndicators}</span>
              <span>已入库 {data.stats.inDatabase}</span>
              <span>已订阅 {data.stats.withSubscription}</span>
              <span>有最新值 {data.stats.withLatestValue}</span>
              <span className="text-emerald-500/90">已确认获取 {data.stats.fetchKnown}</span>
              <span className="text-amber-500/90">待确定 {data.stats.fetchPending}</span>
              <span className="text-red-400/90">未更新 {data.stats.staleCount}</span>
              <span className="text-slate-500">源端暂无新值 {data.stats.sourceCurrentCount}</span>
              <span className="text-emerald-500/80">可自动更新 {data.stats.readyCount}</span>
              <span className="text-slate-600">更新于 {formatDateTime(data.builtAt)}</span>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="shrink-0 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setViewMode("table")}
          className={`rounded-md px-3 py-1.5 text-sm ${
            viewMode === "table"
              ? "bg-slate-800 text-slate-100"
              : "text-slate-500 hover:bg-slate-900 hover:text-slate-300"
          }`}
        >
          数据列表
        </button>
        <button
          type="button"
          onClick={() => setViewMode("tree")}
          className={`rounded-md px-3 py-1.5 text-sm ${
            viewMode === "tree"
              ? "bg-slate-800 text-slate-100"
              : "text-slate-500 hover:bg-slate-900 hover:text-slate-300"
          }`}
        >
          编辑目录树
        </button>
      </div>

      {viewMode === "tree" ? <CatalogTreeEditor onSaved={() => load()} /> : null}

      {viewMode === "table" ? (
        <>
      <SchedulerToolbar
        onDone={() => load()}
        onShowRuns={() => loadFetchRuns()}
        onShowCalendar={() => setShowCalendar((v) => !v)}
      />

      {showCalendar ? <CalendarMappingPanel onClose={() => setShowCalendar(false)} /> : null}

      <DataSchedulerInfoCard
        open={schedulerInfoOpen}
        onToggle={() => setSchedulerInfoOpen((v) => !v)}
        calendarWarning={calendarWarning}
        staleCount={data?.stats.staleCount ?? 0}
        sourceCurrentCount={data?.stats.sourceCurrentCount ?? 0}
      />

      {showRuns ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium text-slate-200">最近拉取日志</span>
            <button type="button" className="text-slate-500 hover:text-slate-300" onClick={() => setShowRuns(false)}>
              关闭
            </button>
          </div>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-slate-400">
            {fetchRuns.map((r) => (
              <li key={`${r.instrumentCode}-${r.startedAt}`}>
                <span className="font-mono text-slate-500">{r.instrumentCode}</span>{" "}
                {r.status} +{r.rowsUpserted} · {formatDateTime(r.startedAt)}
                {r.error ? <span className="text-red-400"> · {r.error}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索指标名、代码、fred:/mds: 键…"
          className="min-w-[240px] flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-600"
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400">
          <input
            type="checkbox"
            checked={onlySubscribed}
            onChange={(e) => setOnlySubscribed(e.target.checked)}
            className="rounded border-slate-600"
          />
          仅显示已订阅
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400">
          <input
            type="checkbox"
            checked={onlyPending}
            onChange={(e) => setOnlyPending(e.target.checked)}
            className="rounded border-slate-600"
          />
          仅显示获取待确定
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400">
          <input
            type="checkbox"
            checked={onlyStale}
            onChange={(e) => setOnlyStale(e.target.checked)}
            className="rounded border-slate-600"
          />
          仅显示未更新
        </label>
      </div>

      <p className="text-xs text-slate-500">
        命令行：探测 <code className="text-slate-400">npm run data:probe-sources</code>
        · TE 日历 <code className="text-slate-400">npm run data:sync-calendar</code>
        · 未更新 <code className="text-slate-400">npm run data:sync-all-stale</code>
        · worker <code className="text-slate-400">npm run data:worker</code>
        · Excel 历史 <code className="text-slate-400">npm run db:import-macro-xlsx</code>
      </p>

      {error ? (
        <div className="rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <p className="text-sm text-slate-500">加载中…</p>
      ) : null}

      {filteredCountries.length > 0 ? (
        <UnifiedCatalogTable
          countries={filteredCountries}
          expanded={expanded}
          onToggle={toggle}
          onRefresh={() => load()}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
        />
      ) : null}

      {!loading && filteredCountries.length === 0 && !error ? (
        <p className="text-sm text-slate-500">无匹配指标</p>
      ) : null}
        </>
      ) : null}
    </div>
  );
}

function filterCountry(
  country: AdminCatalogCountry,
  needle: string,
  onlySubscribed: boolean,
  onlyPending: boolean,
  onlyStale: boolean,
): AdminCatalogCountry {
  const filterRows = (rows: AdminCatalogIndicator[]) => {
    let indicators = rows;
    if (onlySubscribed) {
      indicators = indicators.filter((i) => i.networkAcquisitionConfirmed && i.hasScheduledUpdates);
    }
    if (onlyStale) {
      indicators = indicators.filter((i) => i.isStale);
    }
    if (onlyPending) {
      indicators = indicators.filter((i) => !i.networkAcquisitionConfirmed);
    }
    if (needle) {
      indicators = indicators.filter(
        (i) =>
          i.label.toLowerCase().includes(needle) ||
          i.key.toLowerCase().includes(needle) ||
          (i.instrumentCode?.toLowerCase().includes(needle) ?? false) ||
          i.categoryName.toLowerCase().includes(needle),
      );
    }
    return indicators;
  };

  const categories = country.categories
    .map((cat) => {
      const indicators = filterRows(cat.indicators);
      const subgroups = (cat.subgroups ?? [])
        .map((sg) => ({ ...sg, indicators: filterRows(sg.indicators) }))
        .filter((sg) => sg.indicators.length > 0);
      return { ...cat, indicators, subgroups: subgroups.length ? subgroups : undefined };
    })
    .filter(
      (c) => c.indicators.length > 0 || (c.subgroups?.some((sg) => sg.indicators.length > 0) ?? false),
    );
  return { ...country, categories };
}
