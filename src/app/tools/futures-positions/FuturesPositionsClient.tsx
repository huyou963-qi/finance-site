"use client";

import { CotReportTableView, useCotReport } from "@/components/macro/CotReportTable";

export function FuturesPositionsClient() {
  const { data, error, loading, load } = useCotReport();

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-fs-text">期货持仓报告</h1>
          <p className="mt-1 text-sm text-fs-muted">
            Managed Money 持仓 · CFTC Disaggregated Combined
            {data?.reportDateLabel ? (
              <span className="ml-2 text-fs-secondary">
                Week to Tuesday: {data.reportDateLabel}
              </span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => load().catch(() => {})}
          disabled={loading}
          className="rounded-md border border-fs-border bg-fs-elevated px-3 py-1.5 text-sm text-fs-text hover:bg-fs-elevated disabled:opacity-50"
        >
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
          <p className="mt-2 text-xs text-fs-negative/80">
            若尚未初始化数据，请在服务器运行：npm run data:seed-cot
          </p>
        </div>
      ) : null}

      <CotReportTableView data={data} loading={loading} />

      <p className="text-xs text-fs-muted">
        数据来源：{data?.source ?? "CFTC"}。净仓 = 管理基金多头 − 空头；未含 spread。Brent (ICE)、Gas
        Oil (ICE)、价格涨跌列暂未接入。周频自动更新由 data:worker 调度。
      </p>
    </div>
  );
}
