"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { WeeklyReportDetail, WeeklyReportListItem } from "@/lib/data/weeklyReports";
import { WeeklyMarkdown } from "@/components/weekly/WeeklyMarkdown";
import { WeeklyHistorySidebar } from "@/components/weekly/WeeklyHistorySidebar";

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
    fetch(`/api/weekly-reports/${selectedId}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) throw new Error("请先登录");
        const j = (await r.json()) as { report?: WeeklyReportDetail; error?: string };
        if (!r.ok) throw new Error(j.error ?? "加载详情失败");
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
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <WeeklyHistorySidebar
            list={list}
            total={total}
            selectedId={selectedId}
            onSelect={selectReport}
          />

          <main className="min-w-0 flex-1 overflow-y-auto px-4 py-4 lg:px-8 lg:py-5">
            {detailLoading && !detail ? (
              <div className="text-sm text-fs-muted">加载报告…</div>
            ) : detail && activeMeta ? (
              <div className="w-full min-w-0">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-fs-text">
                    截至 {activeMeta.weekEnding}
                  </h2>
                  <span className="rounded bg-fs-elevated px-2 py-0.5 text-xs text-fs-secondary">
                    {activeMeta.scope}
                  </span>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => void deleteSelected()}
                      disabled={deleting}
                      className="ml-auto rounded-md border border-fs-negative/40 px-2.5 py-1 text-xs font-medium text-fs-negative hover:bg-fs-negative/10 disabled:opacity-50"
                    >
                      {deleting ? "删除中…" : "删除本期"}
                    </button>
                  ) : null}
                </div>
                <p className="text-sm text-fs-muted">
                  {activeMeta.title} · 生成 {activeMeta.generatedAt}
                </p>
                {error ? <p className="mt-2 text-sm text-fs-negative">{error}</p> : null}

                <div className="mt-4 rounded-lg border border-fs-border bg-fs-elevated/80 px-4 py-3">
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

                <div className="mt-4 flex flex-wrap gap-3">
                  {activeMeta.kpis.map((k) => (
                    <div
                      key={k.label}
                      className="min-w-[7.5rem] rounded-lg border border-fs-border bg-fs-elevated px-3 py-2"
                    >
                      <div className="text-[11px] text-fs-muted">{k.label}</div>
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
