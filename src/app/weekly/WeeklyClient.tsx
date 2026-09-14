"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { WeeklyReportDetail, WeeklyReportListItem } from "@/lib/data/weeklyReports";
import { WeeklyMarkdown } from "@/components/weekly/WeeklyMarkdown";
import { WeeklyHistorySidebar } from "@/components/weekly/WeeklyHistorySidebar";
import { MobileSheet } from "@/components/mobile/MobileSheet";
import {
  IconCalendar,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
} from "@/components/mobile/mobileIcons";
import Link from "next/link";

function kpiTone(label: string, dir: "up" | "down" | "flat"): string {
  if (label === "HY OAS" && dir === "up") return "text-fs-negative";
  if (label === "VIX" && dir === "down") return "text-fs-accent-text";
  if (dir === "up") return "text-amber-300";
  if (dir === "down") return "text-fs-accent-text";
  return "text-fs-text";
}

function WeeklyClientInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportIdFromUrl = searchParams.get("report");

  const [list, setList] = useState<WeeklyReportListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WeeklyReportDetail | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  /** 手机端：历史周报底部面板 */
  const [historyOpen, setHistoryOpen] = useState(false);

  const selectReport = useCallback(
    (id: string) => {
      setSelectedId(id);
      router.replace(`/weekly?report=${id}`, { scroll: false });
    },
    [router],
  );

  const loadList = useCallback(async (): Promise<WeeklyReportListItem[]> => {
    setListLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/weekly-reports?limit=100", { cache: "no-store" });
      if (r.status === 401) {
        setError("请先登录后查看 AI周度观察");
        setList([]);
        setTotal(0);
        return [];
      }
      const j = (await r.json()) as {
        reports?: WeeklyReportListItem[];
        total?: number;
        error?: string;
      };
      if (!r.ok) throw new Error(j.error ?? "加载列表失败");
      const reports = j.reports ?? [];
      setList(reports);
      setTotal(j.total ?? reports.length);
      return reports;
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      return [];
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as { user?: { role: "admin" | "user" } };
      })
      .then((j) => setIsAdmin(j?.user?.role === "admin"))
      .catch(() => setIsAdmin(false));
  }, []);

  const deleteSelected = useCallback(async () => {
    if (!selectedId || !detail) return;
    const label = detail.meta.weekEnding;
    if (!window.confirm(`确定删除 ${label} 这期周报？此操作不可恢复。`)) return;
    setDeleting(true);
    setError(null);
    try {
      const r = await fetch(`/api/weekly-reports/${selectedId}`, { method: "DELETE" });
      const j = (await r.json()) as { error?: string };
      if (r.status === 403) throw new Error("无管理员权限");
      if (!r.ok) throw new Error(j.error ?? "删除失败");
      const remaining = await loadList();
      if (remaining.length > 0) {
        selectReport(remaining[0]!.id);
      } else {
        setSelectedId(null);
        setDetail(null);
        router.replace("/weekly", { scroll: false });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }, [selectedId, detail, loadList, selectReport, router]);

  useEffect(() => {
    if (list.length === 0) {
      setSelectedId(null);
      setDetail(null);
      return;
    }
    const fromUrl = reportIdFromUrl;
    const valid = Boolean(fromUrl && list.some((x) => x.id === fromUrl));
    const id = valid ? fromUrl! : list[0]!.id;
    setSelectedId(id);
    if (!valid) {
      router.replace(`/weekly?report=${id}`, { scroll: false });
    }
  }, [list, reportIdFromUrl, router]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setTruncated(false);
    fetch(`/api/weekly-reports/${selectedId}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) throw new Error("请先登录");
        const j = (await r.json()) as {
          report?: WeeklyReportDetail;
          error?: string;
          truncated?: boolean;
        };
        if (!r.ok) throw new Error(j.error ?? "加载详情失败");
        setTruncated(Boolean(j.truncated));
        return j.report ?? null;
      })
      .then((report) => {
        if (!cancelled) setDetail(report);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载详情失败");
          setDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const activeMeta = detail?.meta ?? list.find((x) => x.id === selectedId)?.meta;

  // 列表按截至日期倒序：下标越大越早
  const selectedIndex = list.findIndex((x) => x.id === selectedId);
  const olderReportId = selectedIndex >= 0 ? (list[selectedIndex + 1]?.id ?? null) : null;
  const newerReportId = selectedIndex > 0 ? (list[selectedIndex - 1]?.id ?? null) : null;

  const emptyState = useMemo(() => {
    if (listLoading) return "加载中…";
    if (error) return error;
    if (total === 0) return "暂无周报。Automation 写入后会显示在这里。";
    return null;
  }, [listLoading, error, total]);

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      {emptyState && !detail ? (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-fs-muted">
          {emptyState}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          {/* 手机端：历史周报收进底部面板，顶部放期数切换 */}
          <div className="flex min-h-13 shrink-0 items-center gap-2 border-b border-fs-border py-1 pl-3 pr-1 md:hidden">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="inline-flex h-9 min-w-0 items-center gap-1.5 rounded-md border border-fs-border bg-white px-2.5 text-sm font-semibold text-fs-text active:bg-fs-elevated"
            >
              <IconCalendar size={16} className="shrink-0 text-fs-muted" />
              <span className="truncate tabular-nums">
                {activeMeta ? `截至 ${activeMeta.weekEnding}` : "历史周报"}
              </span>
              <IconChevronDown size={16} className="shrink-0 text-fs-muted" />
            </button>
            {activeMeta ? (
              <span className="shrink-0 rounded bg-fs-elevated px-1.5 py-0.5 text-[11px] text-fs-secondary max-[374px]:hidden">
                {activeMeta.scope}
              </span>
            ) : null}
            <span className="flex-1" />
            <button
              type="button"
              disabled={!olderReportId}
              onClick={() => olderReportId && selectReport(olderReportId)}
              aria-label="上一期"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fs-secondary active:bg-fs-elevated disabled:opacity-30"
            >
              <IconChevronLeft size={22} />
            </button>
            <button
              type="button"
              disabled={!newerReportId}
              onClick={() => newerReportId && selectReport(newerReportId)}
              aria-label="下一期"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fs-secondary active:bg-fs-elevated disabled:opacity-30"
            >
              <IconChevronRight size={22} />
            </button>
          </div>

          <WeeklyHistorySidebar
            list={list}
            total={total}
            selectedId={selectedId}
            onSelect={selectReport}
            className="max-md:hidden"
          />

          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 max-md:px-3 lg:px-8 lg:py-5">
            {detailLoading && !detail ? (
              <div className="text-sm text-fs-muted">加载报告…</div>
            ) : detail && activeMeta ? (
              <div className="w-full min-w-0">
                {truncated ? (
                  <div className="mb-4 rounded-lg border border-fs-accent/30 bg-fs-accent-soft/50 px-3 py-2 text-sm text-fs-secondary">
                    当前为摘要预览。{" "}
                    <Link href="/pricing" className="font-medium text-fs-accent-text underline">
                      升级 Pro
                    </Link>{" "}
                    阅读全文。
                  </div>
                ) : null}
                <div className="mb-4 flex flex-wrap items-center gap-2 max-md:mb-0">
                  <h2 className="text-lg font-semibold text-fs-text max-md:hidden">
                    截至 {activeMeta.weekEnding}
                  </h2>
                  <span className="rounded bg-fs-elevated px-2 py-0.5 text-xs text-fs-secondary max-md:hidden">
                    {activeMeta.scope}
                  </span>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => void deleteSelected()}
                      disabled={deleting}
                      className="ml-auto rounded-md border border-fs-negative/40 px-2.5 py-1 text-xs font-medium text-fs-negative hover:bg-fs-negative/10 disabled:opacity-50 max-md:mb-3"
                    >
                      {deleting ? "删除中…" : "删除本期"}
                    </button>
                  ) : null}
                </div>
                <h1 className="text-xl font-semibold leading-snug text-fs-text md:hidden">
                  {activeMeta.title}
                </h1>
                <p className="mt-1.5 text-xs tabular-nums text-fs-muted md:hidden">
                  生成 {activeMeta.generatedAt}
                </p>
                <p className="text-sm text-fs-muted max-md:hidden">
                  {activeMeta.title} · 生成 {activeMeta.generatedAt}
                </p>
                {error ? <p className="mt-2 text-sm text-fs-negative">{error}</p> : null}

                <div className="mt-4 rounded-lg border border-fs-border bg-fs-elevated/80 px-4 py-3 max-md:px-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-fs-text">
                      Regime: {activeMeta.regime}
                    </span>
                    <span className="rounded bg-fs-elevated px-2 py-0.5 text-xs text-fs-secondary">
                      信心 {activeMeta.regimeConfidence}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-fs-muted">{activeMeta.summaryOneLiner}</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-3 max-md:grid max-md:grid-cols-3 max-md:gap-2">
                  {activeMeta.kpis.map((k) => (
                    <div
                      key={k.label}
                      className="min-w-[7.5rem] rounded-lg border border-fs-border bg-fs-elevated px-3 py-2 max-md:min-w-0 max-md:px-2.5"
                    >
                      <div className="truncate text-[11px] text-fs-muted">{k.label}</div>
                      <div className={`text-base font-semibold ${kpiTone(k.label, k.dir)}`}>
                        {k.value}
                      </div>
                      <div className="text-xs text-fs-muted">{k.delta}</div>
                    </div>
                  ))}
                </div>

                <hr className="my-6 border-fs-border" />

                <WeeklyMarkdown content={detail.bodyMarkdown} />
              </div>
            ) : (
              <div className="text-sm text-fs-muted">请选择左侧周报</div>
            )}
          </main>

          <MobileSheet
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            title="历史周报"
            size="tall"
          >
            <WeeklyHistorySidebar
              variant="sheet"
              list={list}
              total={total}
              selectedId={selectedId}
              onSelect={(id) => {
                selectReport(id);
                setHistoryOpen(false);
              }}
            />
          </MobileSheet>
        </div>
      )}
    </div>
  );
}

export function WeeklyClient() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-fs-muted">
          加载中…
        </div>
      }
    >
      <WeeklyClientInner />
    </Suspense>
  );
}
