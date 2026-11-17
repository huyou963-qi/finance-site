"use client";

import { useEffect, useMemo, useState } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { columnHeader, formatCellValue } from "@/lib/equity/stockData/display";
import { getIndicator } from "@/lib/equity/stockData/indicatorRegistry";
import { buildHistoryColumns } from "@/lib/equity/stockData/seriesQuery";
import type { ColumnSpec, StockDataResponse } from "@/lib/equity/stockData/types";

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

type Props = {
  symbol: string;
  name: string;
  column: ColumnSpec;
  onClose: () => void;
};

/**
 * 点格子弹出的时序面板：对同一指标拉多期/多截止日，用现有 query 接口，简单折线展示。
 */
export function CellSeriesPanel({ symbol, name, column, onClose }: Props) {
  const def = getIndicator(column.indicatorId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [points, setPoints] = useState<{ label: string; value: number | null; muted: string }[]>([]);

  const historyCols = useMemo(
    () => buildHistoryColumns(column.indicatorId, { years: def?.params.includes("period") ? 8 : 12 }),
    [column.indicatorId, def],
  );

  useEffect(() => {
    if (!historyCols?.length) {
      setLoading(false);
      setError("该指标暂不支持时序");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const r = await fetch("/api/equity/stock-data/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: [symbol], columns: historyCols }),
        });
        const j = await r.json();
        if (!r.ok) {
          if (!cancelled) setError(j.error || "取数失败");
          return;
        }
        const res = j as StockDataResponse;
        const row = res.rows[0];
        if (!row) {
          if (!cancelled) setError("无数据");
          return;
        }
        const next = historyCols.map((c) => {
          const cell = row.cells[c.key];
          const h = columnHeader(c);
          const formatted = formatCellValue(def?.unit ?? "text", cell, c.params.scale);
          return {
            label: h.params || h.label,
            value: cell?.s === "ok" && typeof cell.v === "number" ? cell.v : null,
            muted: formatted.muted ? formatted.text : "",
          };
        });
        if (!cancelled) setPoints(next);
      } catch {
        if (!cancelled) setError("网络异常");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [symbol, historyCols, def?.unit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (loading || error || !points.length) return;
    const el = document.getElementById("stock-data-cell-series-chart");
    if (!el) return;
    const chart = echarts.init(el);
    const xs = points.map((p) => p.label);
    const ys = points.map((p) => p.value);
    const unit = def?.unit;
    chart.setOption({
      grid: { left: 48, right: 16, top: 24, bottom: 48 },
      tooltip: {
        trigger: "axis",
        formatter: (items: unknown) => {
          const arr = Array.isArray(items) ? items : [];
          const first = arr[0] as { axisValue?: string; data?: number | null } | undefined;
          if (!first) return "";
          const i = xs.indexOf(String(first.axisValue ?? ""));
          const pt = i >= 0 ? points[i] : null;
          if (!pt) return String(first.axisValue ?? "");
          if (pt.value == null) return `${pt.label}<br/>${pt.muted || "—"}`;
          const { text } = formatCellValue(unit ?? "text", { v: pt.value, s: "ok" });
          return `${pt.label}<br/>${text}`;
        },
      },
      xAxis: { type: "category", data: xs, axisLabel: { rotate: 40, fontSize: 10, color: "#9da8b6" } },
      yAxis: { type: "value", axisLabel: { fontSize: 10, color: "#9da8b6" }, splitLine: { lineStyle: { color: "#1e2630" } } },
      series: [{ type: unit === "money" || unit === "shares" ? "bar" : "line", data: ys, connectNulls: false, showSymbol: true }],
    });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => { ro.disconnect(); chart.dispose(); };
  }, [loading, error, points, def?.unit]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-6" role="dialog" aria-modal="true" aria-label="指标时序">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="关闭" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-t-2xl border border-fs-border bg-fs-bg shadow-xl md:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-fs-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{def?.label ?? column.indicatorId}</p>
            <p className="text-xs text-fs-muted">{symbol} · {name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-fs-muted hover:bg-fs-elevated" aria-label="关闭">✕</button>
        </div>
        <div className="min-h-0 flex-1 p-4">
          {loading ? <p className="text-sm text-fs-muted">加载中…</p> : null}
          {error ? <p role="alert" className="text-sm text-fs-muted">{error}</p> : null}
          {!loading && !error ? <div id="stock-data-cell-series-chart" className="h-64 w-full md:h-80" /> : null}
        </div>
      </div>
    </div>
  );
}
