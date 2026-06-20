"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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
      <div className="text-sm font-medium text-slate-200">调度操作</div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} disabled={!!busy} onClick={() => run("sync_calendar")}>
          {busy === "sync_calendar" ? "同步中…" : "刷新经济日历"}
        </button>
        <button type="button" className={btn} disabled={!!busy} onClick={() => run("run_worker")}>
          {busy === "run_worker" ? "运行中…" : "跑到期任务"}
        </button>
        <button type="button" className={btn} disabled={!!busy} onClick={() => run("run_worker_bis")}>
          {busy === "run_worker_bis" ? "运行中…" : "跑 BIS 订阅"}
        </button>
        <button type="button" className={btn} disabled={!!busy} onClick={() => run("probe_overview")}>
          {busy === "probe_overview" ? "探测中…" : "探测 overview"}
        </button>
        <button type="button" className={btn} disabled={!!busy} onClick={onShowRuns}>
          最近拉取日志
        </button>
        <button type="button" className={btn} disabled={!!busy} onClick={onShowCalendar}>
          日历映射
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btn}
          disabled={!!busy}
          onClick={() => run("run_worker_overview")}
        >
          {busy === "run_worker_overview" ? "运行中…" : "跑 Overview xlsx"}
        </button>
        <button
          type="button"
          className={btn}
          disabled={!!busy}
          onClick={() => run("reimport_overview_cn")}
        >
          {busy === "reimport_overview_cn" ? "重导中…" : "重导中国 xlsx"}
        </button>
        <button
          type="button"
          className={btn}
          disabled={!!busy}
          onClick={() => run("reimport_overview_jp")}
        >
          {busy === "reimport_overview_jp" ? "重导中…" : "重导日本 xlsx"}
        </button>
        <button
          type="button"
          className={btn}
          disabled={!!busy}
          onClick={() => run("run_worker_estat")}
        >
          {busy === "run_worker_estat" ? "运行中…" : "跑 e-Stat 试点"}
        </button>
        <button
          type="button"
          className={btn}
          disabled={!!busy}
          onClick={() => run("check_lag_alerts", { dryRun: true })}
        >
          {busy === "check_lag_alerts" ? "检测中…" : "滞后检测"}
        </button>
        <button
          type="button"
          className={btn}
          disabled={!!busy}
          onClick={() => run("check_lag_alerts", { dryRun: false, force: true })}
        >
          发送告警
        </button>
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
        <span className="font-medium text-slate-200">Investing 日历映射（覆盖内置）</span>
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
  if (!row.inDatabase || !row.fetchAcquisitionStatus) {
    return <span className="text-slate-500">未探测</span>;
  }
  const ok = row.fetchAcquisitionStatus === "known";
  return (
    <div>
      <span className={ok ? "text-emerald-400" : "text-amber-400"}>
        {ok ? "已确认获取" : "待确定"}
      </span>
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
        <div className="mt-0.5 text-slate-600">
          探测 {formatDate(row.fetchAcquisitionProbedAt)}
        </div>
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
  return (
    <tr className="border-b border-slate-900/80 align-top hover:bg-slate-900/40">
      <td className="px-3 py-2">
        <div className="font-medium text-slate-100">{row.label}</div>
        <div className="mt-0.5 font-mono text-[11px] text-slate-500">{row.key}</div>
        {row.instrumentCode ? (
          <div className="font-mono text-[11px] text-slate-600">{row.instrumentCode}</div>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-300">{row.frequency}</td>
      <td className="px-3 py-2 text-sm text-slate-200">
        {row.dbSource ?? <span className="text-slate-500">—</span>}
      </td>
      <td className="px-3 py-2">
        <SourceLinks row={row} />
      </td>
      <td className="px-3 py-2 text-xs">
        <AcquisitionCell row={row} />
      </td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-200">
        {formatValue(row.latestValue, row.unit)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-300">
        {formatDate(row.latestObsDate)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-300">
        {row.hasScheduledUpdates ? formatDateTime(row.nextRunAt) : "—"}
      </td>
      <td className="px-3 py-2 text-xs text-slate-400">
        <div>{row.releaseRuleSummary ?? "未配置订阅"}</div>
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
      </td>
      <td className="px-3 py-2 text-xs">
        {!row.inDatabase ? (
          <span className="text-amber-500/90">未入库</span>
        ) : row.hasScheduledUpdates ? (
          <span className="text-emerald-400">已订阅</span>
        ) : (
          <span className="text-slate-500">无定时</span>
        )}
        {row.lastError ? (
          <div className="mt-1 truncate text-red-400" title={row.lastError}>
            {row.lastError}
          </div>
        ) : null}
        <FetchRunBadge row={row} />
        {row.hasScheduledUpdates && row.instrumentCode ? (
          <SyncOneButton code={row.instrumentCode} onDone={onRefresh} />
        ) : null}
      </td>
    </tr>
  );
}

const COL_COUNT = 10;

function CatalogTableHeader() {
  return (
    <thead className="sticky top-0 z-10 bg-slate-950 text-xs text-slate-500">
      <tr className="border-b border-slate-700">
        <th className="px-3 py-2 text-left font-medium">指标</th>
        <th className="px-3 py-2 text-left font-medium">频度</th>
        <th className="px-3 py-2 text-left font-medium">库内来源</th>
        <th className="px-3 py-2 text-left font-medium">数据源链接</th>
        <th className="px-3 py-2 text-left font-medium">获取方式</th>
        <th className="px-3 py-2 text-left font-medium">最新值</th>
        <th className="px-3 py-2 text-left font-medium">最新日期</th>
        <th className="px-3 py-2 text-left font-medium">下次更新</th>
        <th className="px-3 py-2 text-left font-medium">更新计划</th>
        <th className="px-3 py-2 text-left font-medium">状态</th>
      </tr>
    </thead>
  );
}

function CpiCategoryBadge({ categoryName }: { categoryName: string }) {
  if (categoryName.startsWith("CPI")) {
    return (
      <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-normal text-cyan-400/90">
        BLS/FRED 月更
      </span>
    );
  }
  if (categoryName.startsWith("通胀驱动")) {
    return (
      <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-normal text-amber-400/90">
        驱动因子
      </span>
    );
  }
  return null;
}

function CpiSchedulerInfoCard({
  open,
  onToggle,
  cpiCalendarWarning,
}: {
  open: boolean;
  onToggle: () => void;
  cpiCalendarWarning: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/80">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-900/50"
      >
        <span className="text-sm font-medium text-slate-100">美国 CPI 数据更新机制</span>
        <span className="text-xs text-slate-500">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="border-t border-slate-800 px-4 py-3 text-xs leading-relaxed text-slate-400">
          <p>
            BLS 通常于每月中旬 8:30 ET 发布<strong className="font-normal text-slate-300">上月</strong>
            CPI；Headline、Core 及全部分项与 FRED 同步更新。本系统通过 Investing 经济日历对齐{" "}
            <code className="text-slate-300">nextRunAt</code>，由{" "}
            <code className="text-slate-300">data:worker</code> 在发布窗口拉取 FRED 观测值。
          </p>
          <p className="mt-2">
            运维建议：每小时 <code className="text-slate-300">npm run data:sync-calendar</code>，每
            1–5 分钟 <code className="text-slate-300">npm run data:worker</code>。日频序列（WTI、盈亏平衡通胀）走固定间隔探测。
          </p>
          <p className="mt-2">
            详见仓库文档{" "}
            <code className="text-slate-300">docs/DATA_SCHEDULER_CPI.md</code> 与{" "}
            <code className="text-slate-300">docs/US_CPI_ANALYSIS.md</code>。
          </p>
          {cpiCalendarWarning ? (
            <p className="mt-2 text-amber-400">
              部分 CPI 订阅日历未对齐（403 或未匹配）。请配置 INVESTING_CALENDAR_COOKIE 后运行 sync-calendar。
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CountryCatalogTable({
  country,
  expanded,
  onToggleCategory,
  onRefresh,
}: {
  country: AdminCatalogCountry;
  expanded: Record<string, boolean>;
  onToggleCategory: (key: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="overflow-x-auto border-t border-slate-800">
      <table className="w-full min-w-[1100px] table-fixed text-left text-sm">
        <colgroup>
          <col className="w-[24%]" />
          <col className="w-[5%]" />
          <col className="w-[9%]" />
          <col className="w-[10%]" />
          <col className="w-[17%]" />
          <col className="w-[8%]" />
          <col className="w-[8%]" />
          <col className="w-[9%]" />
          <col className="w-[10%]" />
          <col className="w-[8%]" />
        </colgroup>
        <CatalogTableHeader />
        <tbody>
          {country.categories.map((cat) => {
            const catKey = `${country.code}:${cat.name}`;
            const catOpen = expanded[catKey] !== false;
            return (
              <Fragment key={catKey}>
                <tr className="bg-slate-900/30">
                  <td colSpan={COL_COUNT} className="p-0">
                    <button
                      type="button"
                      onClick={() => onToggleCategory(catKey)}
                      className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-slate-900/50"
                    >
                      <span className="text-sm font-medium text-slate-200">
                        {cat.name}
                        <CpiCategoryBadge categoryName={cat.name} />
                      </span>
                      <span className="text-xs text-slate-500">
                        {cat.indicators.length} 项 {catOpen ? "▾" : "▸"}
                      </span>
                    </button>
                  </td>
                </tr>
                {catOpen
                  ? cat.indicators.map((row) => (
                      <IndicatorRow key={row.key} row={row} onRefresh={onRefresh} />
                    ))
                  : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DataCatalogAdminClient() {
  const [data, setData] = useState<AdminDataCatalogPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [onlySubscribed, setOnlySubscribed] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [fetchRuns, setFetchRuns] = useState<
    { instrumentCode: string; status: string; startedAt: string; rowsUpserted: number; error: string | null }[]
  >([]);
  const [showRuns, setShowRuns] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [cpiInfoOpen, setCpiInfoOpen] = useState(true);

  const cpiCalendarWarning = useMemo(() => {
    if (!data) return false;
    const us = data.countries.find((c) => c.code === "US");
    if (!us) return false;
    return us.categories.some((cat) => {
      if (!cat.name.startsWith("CPI") && !cat.name.startsWith("通胀驱动")) return false;
      return cat.indicators.some(
        (i) =>
          i.hasScheduledUpdates &&
          i.calendarSyncStatus != null &&
          i.calendarSyncStatus !== "matched" &&
          i.calendarSyncStatus !== "probe_only",
      );
    });
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
      for (const c of payload.countries) {
        init[`country:${c.code}`] = true;
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
      .map((country) => filterCountry(country, needle, onlySubscribed, onlyPending))
      .filter((c) => c.categories.length > 0);
  }, [data, q, onlySubscribed, onlyPending]);

  const toggle = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const loadFetchRuns = useCallback(async () => {
    const res = await fetch("/api/admin/data-scheduler/fetch-runs?limit=30", { cache: "no-store" });
    const payload = (await res.json()) as { rows?: typeof fetchRuns };
    setFetchRuns(payload.rows ?? []);
    setShowRuns(true);
  }, []);

  return (
    <div className="w-full min-w-0 space-y-4 px-4 py-4 lg:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">数据更新目录</h1>
          <p className="mt-1 text-sm text-slate-400">
            按宏观侧栏相同的国家 / 主题分类展示指标，含官方数据源、最新观测与计划更新时间。
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      {data ? (
        <div className="flex flex-wrap gap-4 text-sm text-slate-400">
          <span>指标 {data.stats.totalIndicators}</span>
          <span>已入库 {data.stats.inDatabase}</span>
          <span>已订阅 {data.stats.withSubscription}</span>
          <span>有最新值 {data.stats.withLatestValue}</span>
          <span className="text-emerald-500/90">已确认获取 {data.stats.fetchKnown}</span>
          <span className="text-amber-500/90">待确定 {data.stats.fetchPending}</span>
          <span className="text-slate-600">
            更新于 {formatDateTime(data.builtAt)}
          </span>
        </div>
      ) : null}

      <SchedulerToolbar
        onDone={() => load()}
        onShowRuns={() => loadFetchRuns()}
        onShowCalendar={() => setShowCalendar((v) => !v)}
      />

      {showCalendar ? <CalendarMappingPanel onClose={() => setShowCalendar(false)} /> : null}

      <CpiSchedulerInfoCard
        open={cpiInfoOpen}
        onToggle={() => setCpiInfoOpen((v) => !v)}
        cpiCalendarWarning={cpiCalendarWarning}
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
      </div>

      <p className="text-xs text-slate-500">
        批量探测：<code className="text-slate-400">npm run data:probe-sources</code>
        ；对齐发布时间：<code className="text-slate-400">npm run data:sync-calendar</code>
        ；到期拉取：<code className="text-slate-400">npm run data:worker</code>
      </p>

      {error ? (
        <div className="rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <p className="text-sm text-slate-500">加载中…</p>
      ) : null}

      <div className="space-y-3">
        {filteredCountries.map((country) => {
          const countryKey = `country:${country.code}`;
          const countryOpen = expanded[countryKey] !== false;
          const count = country.categories.reduce((n, c) => n + c.indicators.length, 0);
          return (
            <section
              key={country.code}
              className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/50"
            >
              <button
                type="button"
                onClick={() => toggle(countryKey)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-slate-900/50"
              >
                <span className="font-medium text-slate-100">
                  {country.name}
                  <span className="ml-2 text-sm font-normal text-slate-500">{country.code}</span>
                </span>
                <span className="text-sm text-slate-500">
                  {count} 项 {countryOpen ? "▾" : "▸"}
                </span>
              </button>
              {countryOpen ? (
                <CountryCatalogTable
                  country={country}
                  expanded={expanded}
                  onToggleCategory={toggle}
                  onRefresh={() => load()}
                />
              ) : null}
            </section>
          );
        })}
      </div>

      {!loading && filteredCountries.length === 0 && !error ? (
        <p className="text-sm text-slate-500">无匹配指标</p>
      ) : null}
    </div>
  );
}

function filterCountry(
  country: AdminCatalogCountry,
  needle: string,
  onlySubscribed: boolean,
  onlyPending: boolean,
): AdminCatalogCountry {
  const categories = country.categories
    .map((cat) => {
      let indicators = cat.indicators;
      if (onlySubscribed) {
        indicators = indicators.filter((i) => i.hasScheduledUpdates);
      }
      if (onlyPending) {
        indicators = indicators.filter(
          (i) => i.fetchAcquisitionStatus === "pending" || (!i.fetchAcquisitionStatus && i.inDatabase),
        );
      }
      if (needle) {
        indicators = indicators.filter(
          (i) =>
            i.label.toLowerCase().includes(needle) ||
            i.key.toLowerCase().includes(needle) ||
            (i.instrumentCode?.toLowerCase().includes(needle) ?? false),
        );
      }
      return { ...cat, indicators };
    })
    .filter((c) => c.indicators.length > 0);
  return { ...country, categories };
}
