"use client";

import { useEffect, useState } from "react";
import { HistoricalSectorRotation } from "@/components/equity/HistoricalSectorRotation";

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(2)}%`;
}

function pctClass(v: number | null | undefined): string {
  if (v == null) return "text-fs-muted";
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-fs-muted";
}

export function EquitySectorsClient() {
  const [fundRows, setFundRows] = useState<
    {
      sector: string;
      nameZh: string;
      basis?: "Q" | "FY";
      revenueYoYMedian: number | null;
      peMedian: number | null;
      coveragePct: number;
    }[]
  >([]);

  useEffect(() => {
    fetch("/api/equity/fundamentals-overview", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as {
          sectors?: {
            sector: string;
            nameZh: string;
            basis?: "Q" | "FY";
            revenueYoYMedian: number | null;
            peMedian: number | null;
            coveragePct: number;
          }[];
        };
      })
      .then((j) => setFundRows(j?.sectors ?? []))
      .catch(() => setFundRows([]));
  }, []);

  return (
    <div className="flex w-full max-w-none flex-col gap-4 px-2 py-3">
      <HistoricalSectorRotation />

      {fundRows.length > 0 ? (
        <section className="overflow-x-auto rounded-md border border-fs-border">
          <div className="border-b border-fs-border bg-fs-elevated/40 px-3 py-2 text-sm font-medium text-fs-text">
            行业基本面（中位数 · 季度口径：最新季营收增速 + TTM PE）
          </div>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-fs-elevated/60 text-xs text-fs-muted">
              <tr>
                <th className="px-3 py-2 font-medium">行业</th>
                <th className="px-3 py-2 font-medium">营收增速中位</th>
                <th className="px-3 py-2 font-medium">PE 中位</th>
                <th className="px-3 py-2 font-medium">覆盖率</th>
              </tr>
            </thead>
            <tbody>
              {fundRows.map((r) => (
                <tr key={r.sector} className="border-t border-fs-border/60">
                  <td className="px-3 py-2 text-fs-text">
                    {r.nameZh}
                    {r.basis === "FY" ? (
                      <span className="ml-1.5 rounded bg-fs-elevated px-1 py-0.5 text-[10px] text-fs-muted">
                        年报
                      </span>
                    ) : null}
                  </td>
                  <td className={`px-3 py-2 ${pctClass(r.revenueYoYMedian)}`}>
                    {fmtPct(r.revenueYoYMedian)}
                  </td>
                  <td className="px-3 py-2 text-fs-text">
                    {r.peMedian == null ? "—" : r.peMedian.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-fs-muted">
                    {(r.coveragePct * 100).toFixed(0)}%
                    {r.coveragePct < 0.5 ? " · 样本偏少" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="rounded-md border border-dashed border-fs-border bg-fs-elevated/20 px-3 py-4 text-sm text-fs-muted">
          <div className="font-medium text-fs-text">行业基本面暂无数据</div>
          <p className="mt-1">
            快照表为空。请先同步（主数据源为免费 SEC EDGAR companyfacts，不依赖 FMP 付费档）：
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-fs-elevated px-2 py-1.5 text-xs text-fs-text">
            npm run equity:sync-fundamentals -- --limit=100
          </pre>
        </section>
      )}
    </div>
  );
}
