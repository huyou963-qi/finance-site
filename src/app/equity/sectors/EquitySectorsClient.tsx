"use client";

import { useEffect, useMemo, useState } from "react";
import { HistoricalSectorRotation } from "@/components/equity/HistoricalSectorRotation";
import { SectorRegimeForwardStudyPanel } from "@/components/equity/SectorRegimeForwardStudyPanel";
import { SectorRegimeLiveLedgerPanel } from "@/components/equity/SectorRegimeLiveLedgerPanel";
import { SectorRegimeNowcastPanel } from "@/components/equity/SectorRegimeNowcastPanel";

type View = "current" | "history" | "evidence";
type FundamentalRow = {
  sector: string;
  nameZh: string;
  basis?: "Q" | "FY";
  revenueYoYMedian: number | null;
  peMedian: number | null;
  coveragePct: number;
};

function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function pctClass(value: number | null | undefined): string {
  if (value == null) return "text-fs-muted";
  return value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-fs-muted";
}

function CurrentFundamentalPanel({ rows }: { rows: FundamentalRow[] }) {
  const summary = useMemo(() => {
    const withGrowth = rows.filter((row) => row.revenueYoYMedian != null);
    const withPe = rows.filter((row) => row.peMedian != null && row.peMedian! > 0);
    return {
      growth: [...withGrowth].sort((a, b) => (b.revenueYoYMedian ?? -Infinity) - (a.revenueYoYMedian ?? -Infinity))[0] ?? null,
      value: [...withPe].sort((a, b) => (a.peMedian ?? Infinity) - (b.peMedian ?? Infinity))[0] ?? null,
      coverage: rows.length ? rows.reduce((sum, row) => sum + row.coveragePct, 0) / rows.length : null,
    };
  }, [rows]);

  return (
    <section className="rounded-xl border border-fs-border bg-fs-elevated/20" aria-label="当前行业基本面验证">
      <header className="border-b border-fs-border px-4 py-3 sm:px-5">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-fs-accent-text">CURRENT FUNDAMENTALS</p>
        <h2 className="mt-1 text-base font-semibold text-fs-text">当前基本面是否支撑行业表现？</h2>
        <p className="mt-1 text-xs leading-5 text-fs-muted">这是当前最新财报横截面，用于验证收入增长与估值是否彼此匹配；它不是历史阶段的 PIT 回放，也不是买卖建议。</p>
      </header>

      {rows.length ? (
        <div className="space-y-4 px-4 py-4 sm:px-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-fs-border bg-fs-bg/30 p-3"><div className="text-[10px] text-fs-muted">营收增速领先</div><div className="mt-1 text-sm font-semibold text-fs-text">{summary.growth?.nameZh ?? "—"}</div><div className={`mt-1 text-lg tabular-nums ${pctClass(summary.growth?.revenueYoYMedian)}`}>{fmtPct(summary.growth?.revenueYoYMedian)}</div></div>
            <div className="rounded-lg border border-fs-border bg-fs-bg/30 p-3"><div className="text-[10px] text-fs-muted">正 PE 中位数最低</div><div className="mt-1 text-sm font-semibold text-fs-text">{summary.value?.nameZh ?? "—"}</div><div className="mt-1 text-lg tabular-nums text-fs-text">{summary.value?.peMedian?.toFixed(1) ?? "—"}</div></div>
            <div className="rounded-lg border border-fs-border bg-fs-bg/30 p-3"><div className="text-[10px] text-fs-muted">平均样本覆盖</div><div className="mt-1 text-sm font-semibold text-fs-text">当前横截面</div><div className="mt-1 text-lg tabular-nums text-fs-text">{summary.coverage == null ? "—" : `${(summary.coverage * 100).toFixed(0)}%`}</div></div>
          </div>
          <details className="rounded-lg border border-fs-border bg-fs-bg/20">
            <summary className="cursor-pointer px-3 py-2.5 text-xs font-medium text-fs-text">展开全部 11 个行业的当前横截面</summary>
            <div className="overflow-x-auto border-t border-fs-border">
              <table className="min-w-full text-left text-xs"><thead className="bg-fs-elevated/50 text-[10px] text-fs-muted"><tr><th className="px-3 py-2 font-medium">行业</th><th className="px-3 py-2 font-medium">营收增速中位</th><th className="px-3 py-2 font-medium">TTM PE 中位</th><th className="px-3 py-2 font-medium">覆盖率</th></tr></thead><tbody>{rows.map((row) => <tr key={row.sector} className="border-t border-fs-border/60"><td className="px-3 py-2 text-fs-text">{row.nameZh}{row.basis === "FY" ? <span className="ml-1.5 text-[9px] text-fs-muted">年报</span> : null}</td><td className={`px-3 py-2 tabular-nums ${pctClass(row.revenueYoYMedian)}`}>{fmtPct(row.revenueYoYMedian)}</td><td className="px-3 py-2 tabular-nums text-fs-text">{row.peMedian?.toFixed(1) ?? "—"}</td><td className="px-3 py-2 tabular-nums text-fs-muted">{(row.coveragePct * 100).toFixed(0)}%</td></tr>)}</tbody></table>
            </div>
          </details>
        </div>
      ) : <div className="px-4 py-6 text-sm text-fs-muted sm:px-5">行业基本面快照暂不可用，当前判断仅显示宏观研究结论。</div>}
    </section>
  );
}

export function EquitySectorsClient() {
  const [view, setView] = useState<View>("current");
  const [fundRows, setFundRows] = useState<FundamentalRow[]>([]);

  useEffect(() => {
    fetch("/api/equity/fundamentals-overview", { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as { sectors?: FundamentalRow[] } : null)
      .then((data) => setFundRows(data?.sectors ?? []))
      .catch(() => setFundRows([]));
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

      {view === "current" ? <><SectorRegimeNowcastPanel /><SectorRegimeForwardStudyPanel variant="overview" /><CurrentFundamentalPanel rows={fundRows} /></> : null}
      {view === "history" ? <HistoricalSectorRotation /> : null}
      {view === "evidence" ? <><SectorRegimeForwardStudyPanel variant="research" /><SectorRegimeLiveLedgerPanel /></> : null}
    </div>
  );
}
