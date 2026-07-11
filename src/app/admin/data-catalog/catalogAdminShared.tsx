"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminCatalogIndicator } from "@/lib/data/scheduler/adminCatalog";

type SyncMemberDetail = {
  instrumentCode: string;
  instrumentName?: string;
  status: string;
  rowsUpserted: number;
  error?: string;
  inserted?: number;
  changed?: number;
  latestObsDate?: string | null;
  latestValue?: number | null;
};

/** 「2026-05 = 1177」摘要，指明写了哪个月的什么值 */
function obsSummary(row: SyncMemberDetail): string | null {
  if (!row.latestObsDate) return null;
  const month = row.latestObsDate.slice(0, 7);
  const val =
    row.latestValue != null && Number.isFinite(row.latestValue)
      ? row.latestValue.toLocaleString("zh-CN", { maximumFractionDigits: 4 })
      : "—";
  return `${month} = ${val}`;
}

type SyncActionDetails = {
  releasePackageId?: string;
  releasePackageLabelZh?: string;
  packageSyncId?: string;
  succeeded?: SyncMemberDetail[];
  failed?: SyncMemberDetail[];
  failedRows?: SyncMemberDetail[];
  skipped?: SyncMemberDetail[];
  logs?: string[];
  details?: Array<{
    instrumentCode: string;
    instrumentName?: string;
    status: string;
    rowsUpserted: number;
    error?: string;
    releasePackageLabelZh?: string | null;
    inserted?: number;
    changed?: number;
    latestObsDate?: string | null;
    latestValue?: number | null;
  }>;
};

export type SyncReport = {
  ok: boolean;
  message: string;
  action: string;
  details?: SyncActionDetails;
};

export type DrawerKind = "help" | "runs" | "calendar" | "report" | null;

export const BTN =
  "rounded border border-fs-border bg-fs-elevated px-2 py-1 text-xs text-fs-text hover:bg-fs-elevated/80 disabled:opacity-50";
export const BTN_PRIMARY =
  "rounded border border-emerald-800/60 bg-emerald-950/40 px-2.5 py-1 text-xs text-emerald-200 hover:bg-emerald-950/60 disabled:opacity-50";

export function formatValue(value: number | null, unit: string | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  const s = value.toLocaleString("zh-CN", { maximumFractionDigits: digits });
  return unit ? `${s} ${unit}` : s;
}

export function formatDateTime(iso: string | null): string {
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

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export function SyncReportPanel({ report, onClose }: { report: SyncReport; onClose: () => void }) {
  const d = report.details;
  const succeeded =
    d?.succeeded ??
    (d?.details?.filter((x) => x.status === "success" || x.status === "partial") ?? []);
  const failed = d?.failed ?? d?.failedRows ?? (d?.details?.filter((x) => x.status === "failed") ?? []);
  const skipped = d?.skipped ?? (d?.details?.filter((x) => x.status === "skipped") ?? []);
  const logs = d?.logs ?? [];

  return (
    <div className="rounded-lg border border-fs-border bg-fs-elevated/80 p-3 text-xs">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className={`font-medium ${report.ok ? "text-fs-accent-text" : "text-fs-negative"}`}>
            {report.message}
          </div>
          {d?.releasePackageLabelZh ? (
            <div className="mt-1 text-fs-muted">发布包：{d.releasePackageLabelZh}</div>
          ) : null}
          {d?.packageSyncId ? (
            <div className="mt-0.5 font-mono text-[10px] text-fs-secondary">
              同步批次 {d.packageSyncId}
            </div>
          ) : null}
        </div>
        <button type="button" className="shrink-0 text-fs-muted hover:text-fs-secondary" onClick={onClose}>
          关闭
        </button>
      </div>

      {succeeded.length > 0 ? (
        <div className="mb-2">
          <div className="mb-1 font-medium text-fs-accent-text">已更新（{succeeded.length}）</div>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto text-fs-muted">
            {succeeded.map((row) => {
              const summary = obsSummary(row);
              const counts =
                row.inserted != null || row.changed != null
                  ? `新增${row.inserted ?? 0} 改${row.changed ?? 0}`
                  : `+${row.rowsUpserted}`;
              return (
                <li key={row.instrumentCode}>
                  <span className="font-mono text-fs-secondary">{row.instrumentCode}</span>
                  {row.instrumentName ? ` · ${row.instrumentName}` : ""}
                  {summary ? ` · ${summary}` : ""} · {counts}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {failed.length > 0 ? (
        <div className="mb-2">
          <div className="mb-1 font-medium text-fs-negative">失败（{failed.length}）</div>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto">
            {failed.map((row) => (
              <li key={row.instrumentCode} className="text-fs-negative/90">
                <span className="font-mono">{row.instrumentCode}</span>
                {row.instrumentName ? ` · ${row.instrumentName}` : ""}
                {row.error ? ` · ${row.error}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {skipped.length > 0 ? (
        <div className="mb-2">
          <div className="mb-1 font-medium text-fs-muted">跳过（{skipped.length}）</div>
          <ul className="max-h-32 space-y-0.5 overflow-y-auto text-fs-muted">
            {skipped.map((row) => (
              <li key={row.instrumentCode}>
                <span className="font-mono">{row.instrumentCode}</span>
                {row.instrumentName ? ` · ${row.instrumentName}` : ""}
                {row.error ? ` · ${row.error}` : row.latestObsDate ? ` · 无新数据 · 最新 ${obsSummary(row)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {logs.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-fs-muted hover:text-fs-secondary">
            完整日志（{logs.length} 行）
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-fs-bg p-2 font-mono text-[10px] text-fs-muted">
            {logs.join("\n")}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

export function CalendarSyncBadge({ status }: { status: string }) {
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
      ? "text-fs-accent/90"
      : status === "fetch_failed" || status === "no_match"
        ? "text-amber-400"
        : "text-fs-muted";
  return <div className={`mt-1 ${cls}`}>{label}</div>;
}

export function FetchRunBadge({ row }: { row: AdminCatalogIndicator }) {
  if (!row.lastFetchStatus) return null;
  const ok = row.lastFetchStatus === "SUCCESS" || row.lastFetchStatus === "SKIPPED";
  return (
    <div className={`mt-1 ${ok ? "text-fs-muted" : "text-fs-negative"}`}>
      最近拉取 {row.lastFetchStatus}
      {row.lastFetchAt ? ` · ${formatDateTime(row.lastFetchAt)}` : ""}
      {row.lastFetchUpserted != null ? ` · +${row.lastFetchUpserted}` : ""}
    </div>
  );
}

export function Drawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <button
        type="button"
        aria-label="关闭抽屉"
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-fs-border bg-fs-bg shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-fs-border px-4 py-3">
          <h2 className="text-sm font-medium text-fs-text">{title}</h2>
          <button type="button" onClick={onClose} className="text-fs-muted hover:text-fs-secondary">
            关闭
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">{children}</div>
      </aside>
    </>
  );
}

export function Pill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "negative" | "warning" | "accent" | "neutral";
}) {
  const cls =
    tone === "negative"
      ? "border-red-800/50 bg-red-950/40 text-red-300"
      : tone === "warning"
        ? "border-amber-700/50 bg-amber-950/30 text-amber-300"
        : tone === "accent"
          ? "border-emerald-800/50 bg-emerald-950/30 text-emerald-300"
          : "border-fs-border bg-fs-elevated text-fs-secondary";
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${cls}`}>{children}</span>;
}

type CalendarMappingPayload = {
  builtIn: Record<string, { countryCodes: string[]; keywords: string[] }>;
  legacyFallback?: Record<string, { countryCodes: string[]; keywords: string[] }>;
  overrides: Record<
    string,
    { countryCodes: string[]; keywords: string[]; excludeKeywords?: string[]; updatedAt?: string }
  >;
};

export function CalendarMappingPanel({ onClose }: { onClose: () => void }) {
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
    <div className="text-xs">
      <p className="mb-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-amber-200/90">
        新指标请在 <code className="text-amber-100">releasePackageCatalog.ts</code> 维护发布包{" "}
        <code className="text-amber-100">calendar</code>，再执行{" "}
        <code className="text-amber-100">data:seed-release-packages</code>。此处 FRED 覆盖写入数据库。
      </p>
      <p className="mb-2 text-fs-muted">
        发布包内置 {data ? Object.keys(data.builtIn).length : "…"} 条 FRED 映射；遗留表{" "}
        {data?.legacyFallback ? Object.keys(data.legacyFallback).length : "…"} 条；文件覆盖{" "}
        {overrideKeys.length} 条。
      </p>
      {overrideKeys.length > 0 ? (
        <ul className="mb-2 max-h-24 space-y-0.5 overflow-y-auto text-fs-muted">
          {overrideKeys.map((k) => (
            <li key={k}>
              <span className="font-mono text-fs-muted">{k}</span>{" "}
              {data!.overrides[k]!.keywords.join(" · ")}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="text-fs-muted">FRED 键</span>
          <input
            value={fredKey}
            onChange={(e) => setFredKey(e.target.value)}
            className="mt-0.5 w-full rounded border border-fs-border bg-fs-elevated px-2 py-1 text-fs-text"
          />
        </label>
        <label className="block">
          <span className="text-fs-muted">国家代码</span>
          <input
            value={countries}
            onChange={(e) => setCountries(e.target.value)}
            className="mt-0.5 w-full rounded border border-fs-border bg-fs-elevated px-2 py-1 text-fs-text"
          />
        </label>
        <label className="block sm:col-span-1">
          <span className="text-fs-muted">关键词（逗号分隔）</span>
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className="mt-0.5 w-full rounded border border-fs-border bg-fs-elevated px-2 py-1 text-fs-text"
          />
        </label>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={save}
          className="rounded border border-fs-border bg-fs-elevated px-2 py-1 text-fs-text hover:bg-fs-elevated"
        >
          保存覆盖
        </button>
      </div>
      {msg ? <p className="mt-2 text-fs-muted">{msg}</p> : null}
    </div>
  );
}

export function AcquisitionCell({ row }: { row: AdminCatalogIndicator }) {
  if (!row.networkAcquisitionConfirmed) {
    return (
      <div>
        <span className="text-amber-400">待确定</span>
        <div className="mt-0.5 text-fs-muted">
          {!row.inDatabase
            ? "目录项尚未入库，须先入库并确认网络获取方式"
            : "须确认网络获取方式（FRED / BIS / REST 等）并探测通过"}
        </div>
        {row.fetchAcquisitionMessage ? (
          <div className="mt-0.5 text-fs-secondary" title={row.fetchAcquisitionMessage}>
            {row.fetchAcquisitionMessage}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <span className="text-fs-accent-text">已确认获取</span>
      {row.fetchAcquisitionMethod ? (
        <div className="mt-0.5 font-medium text-fs-secondary">{row.fetchAcquisitionMethod}</div>
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
        <div className="mt-0.5 text-fs-muted" title={row.fetchAcquisitionMessage}>
          {row.fetchAcquisitionMessage}
        </div>
      ) : null}
      {row.fetchAcquisitionProbedAt ? (
        <div className="mt-0.5 text-fs-secondary">探测 {formatDate(row.fetchAcquisitionProbedAt)}</div>
      ) : null}
    </div>
  );
}

export function SourceLinks({ row }: { row: AdminCatalogIndicator }) {
  const primary = row.sourcePageUrl;
  const api = row.apiSourceUrl;
  if (!primary && !api) return <span className="text-fs-muted">—</span>;
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      {primary ? (
        <a
          href={primary}
          target="_blank"
          rel="noopener noreferrer"
          className="text-fs-accent-text hover:text-fs-accent-text hover:underline"
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
        <span className="text-fs-muted">
          {row.agencyWebsiteUrl ? (
            <a
              href={row.agencyWebsiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-fs-secondary hover:underline"
            >
              {row.agencyName}
            </a>
          ) : (
            row.agencyName
          )}
        </span>
      ) : null}
      {row.sourceName ? <span className="text-fs-secondary">{row.sourceName}</span> : null}
    </div>
  );
}

export function SyncPackageButton({
  instrumentCode,
  releasePackageId,
  releasePackageLabelZh,
  onDone,
  onReport,
}: {
  instrumentCode: string;
  releasePackageId?: string | null;
  releasePackageLabelZh?: string | null;
  onDone: () => void;
  onReport: (report: SyncReport) => void;
}) {
  const [busy, setBusy] = useState(false);
  const isPackage = Boolean(releasePackageId);
  return (
    <button
      type="button"
      disabled={busy}
      className="mt-1 block text-sky-400 hover:underline disabled:opacity-50"
      title={isPackage ? `同步发布包：${releasePackageLabelZh ?? releasePackageId}` : undefined}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch("/api/admin/data-scheduler/actions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: isPackage ? "sync_package" : "sync_one",
              instrumentCode,
              releasePackageId: releasePackageId ?? undefined,
            }),
          });
          const data = (await res.json()) as SyncReport & { error?: string; details?: SyncActionDetails };
          onReport({
            action: isPackage ? "sync_package" : "sync_one",
            ok: res.ok,
            message: data.message ?? data.error ?? (res.ok ? "完成" : "失败"),
            details: data.details,
          });
          if (res.ok) onDone();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "同步中…" : isPackage ? "立即同步发布包" : "立即同步"}
    </button>
  );
}
