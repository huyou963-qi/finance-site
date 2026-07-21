"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ERROR_REPORT_SOURCE_LABELS,
  ERROR_REPORT_STATUS_LABELS,
  ERROR_REPORT_STATUSES,
  type ErrorReportImageMeta,
  type ErrorReportMetadata,
  type ErrorReportSource,
  type ErrorReportStatus,
} from "@/lib/errorReports/types";

type ReportRow = {
  id: string;
  createdAt: string;
  status: ErrorReportStatus;
  source: ErrorReportSource;
  message: string;
  stack: string | null;
  pageUrl: string;
  userAgent: string | null;
  userNote: string | null;
  digest: string | null;
  username: string | null;
  metadata: ErrorReportMetadata | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  adminNote: string | null;
};

export function AdminErrorReportsClient() {
  const [statusFilter, setStatusFilter] = useState<ErrorReportStatus | "">("open");
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
    const res = await fetch(`/api/admin/error-reports${qs}`, { cache: "no-store" });
    const payload = (await res.json()) as { reports?: ReportRow[]; error?: string };
    if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
    setReports(payload.reports ?? []);
    const drafts: Record<string, string> = {};
    for (const r of payload.reports ?? []) {
      drafts[r.id] = r.adminNote ?? "";
    }
    setNoteDrafts(drafts);
  }, [statusFilter]);

  useEffect(() => {
    load().catch((e) => setHint(e instanceof Error ? e.message : "未知错误"));
  }, [load]);

  const patch = async (
    id: string,
    body: { status?: ErrorReportStatus; adminNote?: string },
  ) => {
    setSavingId(id);
    setHint(null);
    try {
      const res = await fetch(`/api/admin/error-reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      await load();
      setHint("已更新");
    } catch (e) {
      setHint(e instanceof Error ? e.message : "未知错误");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-fs-text">用户反馈</h1>
          <p className="text-xs text-fs-muted">问题报告、新需求与自动崩溃上报</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-fs-muted">状态</label>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter((e.target.value || "") as ErrorReportStatus | "")
            }
            className="rounded border border-fs-border bg-fs-bg px-2 py-1 text-sm"
          >
            <option value="">全部</option>
            {ERROR_REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ERROR_REPORT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              load().catch((e) => setHint(e instanceof Error ? e.message : "未知错误"))
            }
            className="rounded border border-fs-border px-2 py-1 text-sm hover:bg-fs-elevated"
          >
            刷新
          </button>
        </div>
      </div>

      {hint ? <p className="text-sm text-fs-muted">{hint}</p> : null}

      {reports.length === 0 ? (
        <p className="text-sm text-fs-muted">暂无记录</p>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => {
            const open = expanded === r.id;
            return (
              <li
                key={r.id}
                className="rounded border border-fs-border bg-fs-elevated/40 px-3 py-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fs-text break-all">
                      {r.message}
                    </p>
                    <p className="mt-0.5 text-xs text-fs-muted">
                      {new Date(r.createdAt).toLocaleString("zh-CN")}{" | "}
                      {ERROR_REPORT_SOURCE_LABELS[r.source] ?? r.source}{" | "}
                      {ERROR_REPORT_STATUS_LABELS[r.status] ?? r.status}
                      {r.username ? " | " + r.username : " | 匿名"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-fs-muted">{r.pageUrl}</p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-fs-accent-text hover:underline"
                    onClick={() => setExpanded(open ? null : r.id)}
                  >
                    {open ? "收起" : "详情"}
                  </button>
                </div>

                {open ? (
                  <div className="mt-3 space-y-2 border-t border-fs-border pt-3 text-xs">
                    {r.userNote ? (
                      <p>
                        <span className="text-fs-muted">用户说明：</span>
                        {r.userNote}
                      </p>
                    ) : null}
                    {Array.isArray(r.metadata?.images) && r.metadata.images.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {(r.metadata.images as ErrorReportImageMeta[]).map((img, i) => (
                          <a
                            key={`${r.id}-${img.file}`}
                            href={`/api/admin/error-reports/${r.id}/images/${i}`}
                            target="_blank"
                            rel="noreferrer"
                            className="block overflow-hidden rounded border border-fs-border"
                            title={img.name}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/admin/error-reports/${r.id}/images/${i}`}
                              alt={img.name}
                              className="h-24 max-w-[160px] object-contain bg-fs-bg"
                            />
                          </a>
                        ))}
                      </div>
                    ) : null}
                    {r.digest ? (
                      <p>
                        <span className="text-fs-muted">digest：</span>
                        {r.digest}
                      </p>
                    ) : null}
                    {r.userAgent ? (
                      <p className="break-all text-fs-muted">{r.userAgent}</p>
                    ) : null}
                    {r.stack ? (
                      <pre className="max-h-48 overflow-auto rounded bg-fs-bg p-2 font-mono text-[11px] whitespace-pre-wrap break-all">
                        {r.stack}
                      </pre>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-fs-muted">改状态</label>
                      <select
                        value={r.status}
                        disabled={savingId === r.id}
                        onChange={(e) =>
                          void patch(r.id, {
                            status: e.target.value as ErrorReportStatus,
                          })
                        }
                        className="rounded border border-fs-border bg-fs-bg px-2 py-1"
                      >
                        {ERROR_REPORT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {ERROR_REPORT_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                      {r.resolvedBy ? (
                        <span className="text-fs-muted">
                          由 {r.resolvedBy} 于{" "}
                          {r.resolvedAt
                            ? new Date(r.resolvedAt).toLocaleString("zh-CN")
                            : "-"}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-fs-muted">管理员备注</label>
                      <textarea
                        value={noteDrafts[r.id] ?? ""}
                        onChange={(e) =>
                          setNoteDrafts((prev) => ({
                            ...prev,
                            [r.id]: e.target.value,
                          }))
                        }
                        rows={2}
                        className="w-full rounded border border-fs-border bg-fs-bg px-2 py-1"
                      />
                      <button
                        type="button"
                        disabled={savingId === r.id}
                        onClick={() =>
                          void patch(r.id, {
                            adminNote: noteDrafts[r.id] ?? "",
                          })
                        }
                        className="self-start rounded border border-fs-border px-2 py-1 hover:bg-fs-bg disabled:opacity-50"
                      >
                        保存备注
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
