"use client";

import { useCallback, useEffect, useState } from "react";
import type { EquityCoverageReport } from "@/lib/equity/equityCoverageAdmin";
import type { DisclosureBatchHistory as BatchHistory } from "@/lib/equity/disclosureBatchAdmin";
import { DisclosureBatchHistory } from "./DisclosureBatchHistory";

type CoveragePayload = EquityCoverageReport & { disclosureHistory: BatchHistory | null };

function pct(n: number, d: number): string {
  if (!d) return "—";
  return `${((100 * n) / d).toFixed(1)}%`;
}

function SampleList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-2">
      <p className="text-xs text-fs-muted">{title}</p>
      <p className="mt-1 break-all font-mono text-xs text-fs-text">{items.join(" · ")}</p>
    </div>
  );
}

export function EquityCoverageAdminClient() {
  const [report, setReport] = useState<CoveragePayload | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setHint(null);
    try {
      const res = await fetch("/api/admin/equity-coverage", { cache: "no-store" });
      const payload = (await res.json()) as CoveragePayload & { error?: string };
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      setReport(payload);
    } catch (e) {
      setHint(e instanceof Error ? e.message : "加载失败");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-fs-text">美股覆盖率</h1>
          <p className="mt-1 text-sm text-fs-muted">
            SEC 公告日批、基本面覆盖、EBITDA 披露与日线回补状态。仅管理员可见。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="min-h-9 rounded-lg border border-fs-border px-3 text-sm hover:bg-fs-elevated disabled:opacity-40"
        >
          {loading ? "加载中…" : "刷新"}
        </button>
      </div>

      {hint ? (
        <p role="alert" className="rounded-lg border border-fs-border bg-fs-elevated px-3 py-2 text-sm text-fs-negative">
          {hint}
        </p>
      ) : null}

      {!report && loading ? <p className="text-sm text-fs-muted">正在汇总覆盖率…</p> : null}

      {report ? (
        <>
          <p className="text-xs text-fs-muted">
            统计时刻（UTC）：{report.asOf.replace("T", " ").replace(/\.\d+Z$/, "Z")}
          </p>

          <DisclosureBatchHistory history={report.disclosureHistory} />

          <section className="rounded-xl border border-fs-border bg-fs-elevated p-4">
            <h2 className="text-base font-semibold">基本面宇宙</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div>
                <dt className="text-fs-muted">宇宙家数</dt>
                <dd className="text-lg font-medium">{report.fundamentals.universe}</dd>
              </div>
              <div>
                <dt className="text-fs-muted">有季度数据</dt>
                <dd className="text-lg font-medium">
                  {report.fundamentals.withData}
                  <span className="ml-1 text-xs text-fs-muted">
                    ({pct(report.fundamentals.withData, report.fundamentals.universe)})
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-fs-muted">无数据</dt>
                <dd className="text-lg font-medium">{report.fundamentals.noData}</dd>
              </div>
              <div>
                <dt className="text-fs-muted">滞后（&gt;200 天）</dt>
                <dd className="text-lg font-medium">{report.fundamentals.stale}</dd>
              </div>
              <div>
                <dt className="text-fs-muted">有科目明细</dt>
                <dd className="text-lg font-medium">{report.fundamentals.withStatementLines}</dd>
              </div>
            </dl>
            <SampleList title="无数据样本" items={report.fundamentals.sampleNoData} />
            <SampleList
              title="滞后样本"
              items={report.fundamentals.sampleStale.map((s) => `${s.symbol}(${s.latest})`)}
            />
          </section>

          <section className="rounded-xl border border-fs-border bg-fs-elevated p-4">
            <h2 className="text-base font-semibold">EBITDA 披露</h2>
            <p className="mt-1 text-sm text-fs-muted">{report.ebitda.note}</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
              <div>
                <dt className="text-fs-muted">最新季有 EBITDA</dt>
                <dd className="text-lg font-medium">
                  {report.ebitda.withLatestEbitda}
                  <span className="ml-1 text-xs text-fs-muted">
                    ({pct(report.ebitda.withLatestEbitda, report.fundamentals.universe)})
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-fs-muted">历史任一季有</dt>
                <dd className="text-lg font-medium">{report.ebitda.withAnyEbitda}</dd>
              </div>
            </dl>
            <SampleList title="有披露样本" items={report.ebitda.samplePresent} />
            <SampleList title="最新季未披露样本" items={report.ebitda.sampleMissing} />
          </section>

          <section className="rounded-xl border border-fs-border bg-fs-elevated p-4">
            <h2 className="text-base font-semibold">日线回补</h2>
            <p className="mt-1 text-sm text-fs-muted">
              按基本面名单内 {report.prices.universe} 个标的统计。数据源查不到的标的单列，可能仍保有历史日线。
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
              <div>
                <dt className="text-fs-muted">尚无日线</dt>
                <dd className="text-lg font-medium">{report.prices.noBars.count}</dd>
              </div>
              <div>
                <dt className="text-fs-muted">已有日线但滞后（&gt;7 天）</dt>
                <dd className="text-lg font-medium">{report.prices.stale.count}</dd>
              </div>
              <div>
                <dt className="text-fs-muted">数据源查不到代码</dt>
                <dd className="text-lg font-medium">{report.prices.notFound.count}</dd>
              </div>
            </dl>
            <SampleList title="尚无日线样本" items={report.prices.noBars.samples} />
            <SampleList title="滞后样本（最后交易日）" items={report.prices.stale.samples} />
            <SampleList title="数据源查不到代码的样本" items={report.prices.notFound.samples} />
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-fs-border pt-3 text-sm">
              <div>
                <dt className="text-fs-muted">全库回补状态记录</dt>
                <dd className="text-lg font-medium">{report.prices.coverageRows}</dd>
              </div>
              <div>
                <dt className="text-fs-muted">全库已抓取全历史</dt>
                <dd className="text-lg font-medium">{report.prices.fullHistory}</dd>
              </div>
            </dl>
          </section>
        </>
      ) : null}
    </div>
  );
}
