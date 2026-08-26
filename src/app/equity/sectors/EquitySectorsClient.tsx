"use client";

import { useEffect, useMemo, useState } from "react";
import { HistoricalSectorRotation } from "@/components/equity/HistoricalSectorRotation";
import { SectorRegimeForwardStudyPanel } from "@/components/equity/SectorRegimeForwardStudyPanel";
import { SectorRegimeLiveLedgerPanel } from "@/components/equity/SectorRegimeLiveLedgerPanel";
import { SectorRegimeNowcastPanel } from "@/components/equity/SectorRegimeNowcastPanel";
import { STYLE_BUCKETS } from "@/lib/equity/styleBuckets";

type View = "current" | "history" | "evidence";
type FundamentalRow = {
  sector: string;
  nameZh: string;
  basis?: "Q" | "FY";
  period: string | null;
  previousPeriod: string | null;
  revenueYoYMedian: number | null;
  previousRevenueYoYMedian: number | null;
  peMedian: number | null;
  previousPeMedian: number | null;
  sampleCount: number;
  universeCount: number;
  coveragePct: number;
};

const FUNDAMENTAL_SECTOR_ORDER = new Map<string, number>(
  STYLE_BUCKETS.flatMap((bucket) => bucket.sectors).map((sector, index) => [sector, index]),
);

function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function pctClass(value: number | null | undefined): string {
  if (value == null) return "text-fs-muted";
  return value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-fs-muted";
}

function formatQuarter(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{4})Q([1-4])$/.exec(value);
  return match ? `${match[1]}-Q${match[2]}` : value;
}

function CurrentFundamentalPanel({ rows, loading }: { rows: FundamentalRow[]; loading: boolean }) {
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => (FUNDAMENTAL_SECTOR_ORDER.get(a.sector) ?? Number.MAX_SAFE_INTEGER) - (FUNDAMENTAL_SECTOR_ORDER.get(b.sector) ?? Number.MAX_SAFE_INTEGER)),
    [rows],
  );
  const summary = useMemo(() => {
    const withGrowth = rows.filter((row) => row.revenueYoYMedian != null);
    const withPe = rows.filter((row) => row.peMedian != null && row.peMedian! > 0);
    const periodCounts = new Map<string, number>();
    for (const row of rows) {
      if (row.period) periodCounts.set(row.period, (periodCounts.get(row.period) ?? 0) + 1);
    }
    return {
      growth: [...withGrowth].sort((a, b) => (b.revenueYoYMedian ?? -Infinity) - (a.revenueYoYMedian ?? -Infinity))[0] ?? null,
      value: [...withPe].sort((a, b) => (a.peMedian ?? Infinity) - (b.peMedian ?? Infinity))[0] ?? null,
      coverage: rows.length ? rows.reduce((sum, row) => sum + row.coveragePct, 0) / rows.length : null,
      period: [...periodCounts.entries()].sort(([periodA, countA], [periodB, countB]) => countB - countA || periodB.localeCompare(periodA))[0]?.[0] ?? null,
    };
  }, [rows]);

  return (
    <section className="rounded-xl border border-fs-border bg-fs-elevated/20" aria-label="当前行业基本面验证">
      <header className="border-b border-fs-border px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-fs-text">当前基本面是否支撑行业表现？</h2>
            <p className="mt-1 text-xs leading-5 text-fs-muted">按当前已完成季度滚动统计；每周纳入 SEC 新披露的 10-Q/10-K。覆盖率表示已披露公司占行业样本的比例，不是买卖建议。</p>
          </div>
          <div className="shrink-0 text-xs font-medium tabular-nums text-fs-muted">本季：{formatQuarter(summary.period)} · 滚动披露</div>
        </div>
      </header>

      {rows.length ? (
        <div className="space-y-4 px-4 py-4 sm:px-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-fs-border bg-fs-bg/30 p-3"><div className="text-[10px] text-fs-muted">营收增速领先</div><div className="mt-1 text-sm font-semibold text-fs-text">{summary.growth?.nameZh ?? "—"}</div><div className={`mt-1 text-lg tabular-nums ${pctClass(summary.growth?.revenueYoYMedian)}`}>{fmtPct(summary.growth?.revenueYoYMedian)}</div></div>
            <div className="rounded-lg border border-fs-border bg-fs-bg/30 p-3"><div className="text-[10px] text-fs-muted">正 PE 中位数最低</div><div className="mt-1 text-sm font-semibold text-fs-text">{summary.value?.nameZh ?? "—"}</div><div className="mt-1 text-lg tabular-nums text-fs-text">{summary.value?.peMedian?.toFixed(1) ?? "—"}</div></div>
            <div className="rounded-lg border border-fs-border bg-fs-bg/30 p-3"><div className="text-[10px] text-fs-muted">本季平均披露覆盖</div><div className="mt-1 text-sm font-semibold text-fs-text">滚动横截面</div><div className="mt-1 text-lg tabular-nums text-fs-text">{summary.coverage == null ? "—" : `${(summary.coverage * 100).toFixed(0)}%`}</div></div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-fs-border bg-fs-bg/20">
            <table className="min-w-[820px] w-full text-left text-xs"><thead className="bg-fs-elevated/50 text-[10px] text-fs-muted"><tr><th className="px-3 py-2 font-medium">行业</th><th className="px-3 py-2 font-medium">本季营收增速中位</th><th className="px-3 py-2 font-medium">前季营收增速中位</th><th className="px-3 py-2 font-medium">本季 TTM PE 中位</th><th className="px-3 py-2 font-medium">前季 TTM PE 中位</th><th className="px-3 py-2 font-medium">披露覆盖</th></tr></thead><tbody>{sortedRows.map((row) => <tr key={row.sector} className="border-t border-fs-border/60"><td className="px-3 py-2 text-fs-text">{row.nameZh}{row.basis === "FY" ? <span className="ml-1.5 text-[9px] text-fs-muted">年报</span> : null}</td><td className={`px-3 py-2 tabular-nums ${pctClass(row.revenueYoYMedian)}`}>{fmtPct(row.revenueYoYMedian)}</td><td className={`px-3 py-2 tabular-nums ${pctClass(row.previousRevenueYoYMedian)}`}>{fmtPct(row.previousRevenueYoYMedian)}</td><td className="px-3 py-2 tabular-nums text-fs-text">{row.peMedian?.toFixed(1) ?? "—"}</td><td className="px-3 py-2 tabular-nums text-fs-text">{row.previousPeMedian?.toFixed(1) ?? "—"}</td><td className="px-3 py-2 tabular-nums text-fs-muted">{(row.coveragePct * 100).toFixed(0)}% <span className="text-[9px]">({row.sampleCount}/{row.universeCount})</span></td></tr>)}</tbody></table>
          </div>
        </div>
      ) : <div className="px-4 py-6 text-sm text-fs-muted sm:px-5">{loading ? "正在汇总最新 SEC 财报…" : "行业基本面快照暂不可用，当前判断仅显示宏观研究结论。"}</div>}
    </section>
  );
}

export function EquitySectorsClient() {
  const [view, setView] = useState<View>("current");
  const [fundRows, setFundRows] = useState<FundamentalRow[]>([]);
  const [fundLoading, setFundLoading] = useState(true);

  useEffect(() => {
    fetch("/api/equity/fundamentals-overview", { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as { sectors?: FundamentalRow[] } : null)
      .then((data) => setFundRows(data?.sectors ?? []))
      .catch(() => setFundRows([]))
      .finally(() => setFundLoading(false));
  }, []);

  const tabs: Array<{ id: View; label: string; description: string }> = [
    { id: "current", label: "当前判断", description: "现在的宏观环境与基本面" },
    { id: "history", label: "历史复盘", description: "类似阶段的行业轮动与原因" },
    { id: "evidence", label: "证据与方法", description: "检验、前瞻账本与限制" },
  ];

  return (
    <div className="flex w-full max-w-none flex-col gap-4 px-2 py-3">
      <section className="rounded-xl border border-fs-border bg-fs-elevated/20">
        <nav className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" aria-label="行业研究视图">
          <div className="flex flex-wrap gap-1">
            {tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setView(tab.id)} aria-pressed={view === tab.id} className={`rounded-md px-3 py-2 text-left transition ${view === tab.id ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/30" : "text-fs-muted hover:bg-fs-elevated hover:text-fs-text"}`}><span className="block text-sm font-semibold">{tab.label}</span><span className="mt-0.5 block text-[10px] font-semibold opacity-80">{tab.description}</span></button>)}
          </div>
          <div className="px-1 text-right">
            <p className="text-xs font-semibold tracking-[0.14em] text-fs-accent-text">美股行业轮动研究</p>
            <p className="mt-0.5 text-xs text-fs-muted">从当前宏观环境出发，用历史相似阶段解释行业强弱，再用基本面与可审计证据验证结论。</p>
            <p className="mt-0.5 text-xs text-fs-muted">先看现在，再回看历史；研究证据单独呈现。</p>
          </div>
        </nav>
      </section>

      {view === "current" ? <><SectorRegimeNowcastPanel officialDetails={<SectorRegimeForwardStudyPanel variant="overview" embedded />} /><CurrentFundamentalPanel rows={fundRows} loading={fundLoading} /></> : null}
      {view === "history" ? <HistoricalSectorRotation /> : null}
      {view === "evidence" ? <><SectorRegimeForwardStudyPanel variant="research" /><SectorRegimeLiveLedgerPanel /></> : null}
    </div>
  );
}
