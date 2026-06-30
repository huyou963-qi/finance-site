"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { WeeklyReportDetail, WeeklyReportListItem } from "@/lib/data/weeklyReports";
import { WeeklyMarkdown } from "@/components/weekly/WeeklyMarkdown";

function kpiTone(label: string, dir: "up" | "down" | "flat"): string {
  if (label === "HY OAS" && dir === "up") return "text-red-400";
  if (label === "VIX" && dir === "down") return "text-emerald-400";
  if (dir === "up") return "text-amber-300";
  if (dir === "down") return "text-emerald-400";
  return "text-slate-200";
}

function SidebarItem({
  item,
  active,
  onClick,
}: {
  item: WeeklyReportListItem;
  active: boolean;
  onClick: () => void;
}) {
  const regimeShort = item.meta.regime.split(" / ")[0] ?? item.meta.regime;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-1.5 w-full rounded-lg border px-3 py-2.5 text-left transition ${
        active
          ? "border-emerald-700/80 bg-emerald-950/50"
          : "border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900"
      }`}
    >
      <div className="text-sm font-semibold text-slate-100">{item.meta.weekEnding}</div>
      <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">
        {item.meta.title}
      </div>
      <div className="mt-2 inline-block rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
        {regimeShort}
      </div>
    </button>
  );
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
  const [error, setError] = useState<string | null>(null);

  const selectReport = useCallback(
    (id: string) => {
      setSelectedId(id);
      router.replace(`/weekly?report=${id}`, { scroll: false });
    },
    [router],
  );

  const loadList = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/weekly-reports?limit=100", { cache: "no-store" });
      if (r.status === 401) {
        setError("请先登录后查看 AI周度观察");
        setList([]);
        setTotal(0);
        return;
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

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
      <div className="shrink-0 border-b border-slate-800 px-4 py-3 lg:px-6">
        <h1 className="text-xl font-semibold text-slate-50">AI周度观察</h1>
        <p className="mt-1 text-sm text-slate-400">
          周度跨资产市场扫描 · 左侧历史列表 · 右侧完整报告
        </p>
      </div>

      {emptyState && !detail ? (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-400">
          {emptyState}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="w-72 shrink-0 overflow-y-auto border-r border-slate-800 bg-slate-950/50 p-3 lg:w-80">
            <div className="mb-2 text-xs font-medium text-slate-400">历史周报</div>
            {list.map((item) => (
              <SidebarItem
                key={item.id}
                item={item}
                active={item.id === selectedId}
                onClick={() => selectReport(item.id)}
              />
            ))}
            <div className="mt-3 text-[11px] text-slate-500">共 {total} 条 · 按截至日期倒序</div>
          </aside>

          <main className="min-w-0 flex-1 overflow-y-auto p-4 lg:p-6">
            {detailLoading && !detail ? (
              <div className="text-sm text-slate-400">加载报告…</div>
            ) : detail && activeMeta ? (
              <div className="mx-auto max-w-4xl">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-100">
                    截至 {activeMeta.weekEnding}
                  </h2>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                    {activeMeta.scope}
                  </span>
                </div>
                <p className="text-sm text-slate-400">
                  {activeMeta.title} · 生成 {activeMeta.generatedAt}
                </p>

                <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-slate-100">
                      Regime: {activeMeta.regime}
                    </span>
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                      信心 {activeMeta.regimeConfidence}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">{activeMeta.summaryOneLiner}</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  {activeMeta.kpis.map((k) => (
                    <div
                      key={k.label}
                      className="min-w-[7.5rem] rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2"
                    >
                      <div className="text-[11px] text-slate-500">{k.label}</div>
                      <div className={`text-base font-semibold ${kpiTone(k.label, k.dir)}`}>
                        {k.value}
                      </div>
                      <div className="text-xs text-slate-400">{k.delta}</div>
                    </div>
                  ))}
                </div>

                <hr className="my-6 border-slate-800" />

                <WeeklyMarkdown content={detail.bodyMarkdown} />
              </div>
            ) : (
              <div className="text-sm text-slate-400">请选择左侧周报</div>
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
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-400">
          加载中…
        </div>
      }
    >
      <WeeklyClientInner />
    </Suspense>
  );
}
