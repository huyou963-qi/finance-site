"use client";

/**
 * 个股「内部人交易」面板（Form 4 Table I）：逐笔明细表 + 月度净买卖趋势图。
 * 与 13F 机构持仓、空头持仓并列，构成资金侧三角验证的第三块拼图。
 */

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

type InsiderTransactionRow = {
  accession: string;
  filerName: string | null;
  isDirector: boolean;
  isOfficer: boolean;
  isTenPercentOwner: boolean;
  officerTitle: string | null;
  transactionDate: string;
  transactionCode: string;
  acquiredDisposedCode: string;
  shares: number;
  pricePerShare: number | null;
  sharesOwnedAfter: number | null;
  filedAt: string;
};

type InsiderMonthlyNet = {
  month: string;
  buyValue: number;
  sellValue: number;
  netValue: number;
};

const CODE_LABEL_ZH: Record<string, string> = {
  P: "公开市场买入",
  S: "公开市场卖出",
  A: "授予/奖励",
  M: "行权",
  G: "赠予",
  F: "代扣缴税",
};

function fmtShares(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

function fmtUsd(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function codeBadgeClass(code: string): string {
  if (code === "P") return "bg-emerald-500/15 text-emerald-400";
  if (code === "S") return "bg-red-500/15 text-red-400";
  return "bg-fs-elevated text-fs-muted";
}

function NetTrendChart({ monthly }: { monthly: InsiderMonthlyNet[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !monthly.length) return;
    const chart = echarts.init(ref.current);
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        valueFormatter: (v: number) => fmtUsd(v),
      },
      grid: { left: 56, right: 16, top: 16, bottom: 24 },
      xAxis: {
        type: "category",
        data: monthly.map((m) => m.month),
        axisLabel: { color: "#9da8b6", fontSize: 10 },
        axisLine: { lineStyle: { color: "#2a3340" } },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: { color: "#9da8b6", fontSize: 10, formatter: (v: number) => fmtUsd(v) },
        splitLine: { lineStyle: { color: "#1e2630" } },
      },
      series: [
        {
          name: "净买卖（P/S 口径）",
          type: "bar",
          data: monthly.map((m) => ({
            value: m.netValue,
            itemStyle: { color: m.netValue >= 0 ? "#34d399" : "#f87171" },
          })),
        },
      ],
    });
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [monthly]);
  return <div ref={ref} style={{ height: 200, width: "100%" }} />;
}

export function StockInsiderTransactionsPanel({ symbol }: { symbol: string }) {
  const [transactions, setTransactions] = useState<InsiderTransactionRow[]>([]);
  const [monthly, setMonthly] = useState<InsiderMonthlyNet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/equity/stocks/${encodeURIComponent(symbol)}/insider-transactions?limit=200`, {
      cache: "no-store",
    })
      .then(async (r) => {
        const j = (await r.json()) as {
          error?: string;
          transactions?: InsiderTransactionRow[];
          monthly?: InsiderMonthlyNet[];
        };
        if (!r.ok) throw new Error(j.error ?? "内部人交易加载失败");
        if (cancelled) return;
        setTransactions(j.transactions ?? []);
        setMonthly(j.monthly ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return (
    <section className="rounded-md border border-fs-border">
      <div className="flex items-center justify-between gap-2 border-b border-fs-border bg-fs-elevated/40 px-3 py-2">
        <span className="text-sm font-medium text-fs-text">内部人交易</span>
        <span className="text-[11px] text-fs-muted">SEC Form 4 · 逐笔申报</span>
      </div>

      {error ? <div className="px-3 py-3 text-sm text-red-300">{error}</div> : null}

      {loading ? (
        <div className="flex h-24 items-center justify-center text-sm text-fs-muted">加载中…</div>
      ) : transactions.length === 0 ? (
        <div className="px-3 py-4 text-sm text-fs-muted">
          暂无内部人交易数据。批量同步：npm run quant:sync-form4
        </div>
      ) : (
        <>
          {monthly.length > 0 ? (
            <div className="border-b border-fs-border px-3 py-3">
              <div className="mb-1 text-xs font-medium text-fs-muted">月度净买卖（公开市场 P/S 口径）</div>
              <NetTrendChart monthly={monthly} />
            </div>
          ) : null}

          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-fs-bg/95 text-fs-muted">
                <tr className="border-b border-fs-border">
                  <th className="px-3 py-1.5 text-left font-medium">日期</th>
                  <th className="px-2 py-1.5 text-left font-medium">申报人</th>
                  <th className="px-2 py-1.5 text-left font-medium">身份</th>
                  <th className="px-2 py-1.5 text-left font-medium">类型</th>
                  <th className="px-2 py-1.5 text-right font-medium">股数</th>
                  <th className="px-2 py-1.5 text-right font-medium">价格</th>
                  <th className="px-2 py-1.5 text-right font-medium">交易后持股</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, i) => (
                  <tr
                    key={`${t.accession}-${i}`}
                    className="border-b border-fs-border/40 hover:bg-fs-elevated/30"
                  >
                    <td className="px-3 py-1.5 tabular-nums text-fs-text">{t.transactionDate}</td>
                    <td className="px-2 py-1.5 text-fs-text">{t.filerName ?? "—"}</td>
                    <td className="px-2 py-1.5 text-fs-muted">
                      {t.officerTitle ?? (t.isDirector ? "董事" : t.isTenPercentOwner ? "10% 股东" : t.isOfficer ? "高管" : "—")}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${codeBadgeClass(t.transactionCode)}`}>
                        {CODE_LABEL_ZH[t.transactionCode] ?? t.transactionCode}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-fs-text">
                      {t.acquiredDisposedCode === "D" ? "-" : "+"}
                      {fmtShares(t.shares)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-fs-muted">
                      {t.pricePerShare != null ? `$${t.pricePerShare.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-fs-muted">
                      {t.sharesOwnedAfter != null ? fmtShares(t.sharesOwnedAfter) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
