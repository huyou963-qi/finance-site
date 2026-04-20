"use client";

import { useEffect, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { MacroPayload } from "@/lib/data/types";
import { macroPayloadToChartOption } from "@/lib/macroChartOption";
import { buildMacroDemoSeries } from "@/lib/sampleSeries";

export type MacroChartProps = {
  source?: "worldbank" | "fred";
  fredSeriesId?: string;
  worldbankSeries?: string;
};

/** 独立拉取宏观数据并单图展示（宏观页已改用 MacroMultiChartGrid，此组件可保留给其它路由复用） */
export function MacroChart({
  source = "worldbank",
  fredSeriesId = "CPIAUCSL",
  worldbankSeries,
}: MacroChartProps) {
  const [payload, setPayload] = useState<MacroPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setPayload(null);
    setLoading(true);

    const params = new URLSearchParams({ source });
    if (source === "fred") params.set("series", fredSeriesId);
    if (source === "worldbank" && worldbankSeries?.trim()) {
      params.set("series", worldbankSeries.trim());
    }

    fetch(`/api/data/macro?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `${r.status}`);
        }
        return r.json() as Promise<MacroPayload>;
      })
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch(() => {
        if (cancelled) return;
        const demo = buildMacroDemoSeries();
        setPayload({
          title: "演示数据（离线）",
          source: "worldbank",
          categories: demo.categories,
          series: [
            { name: "演示序列 A", data: demo.inflation as (number | null)[] },
            { name: "演示序列 B", data: demo.policyRate as (number | null)[] },
          ],
          attribution: "无法拉取远程宏观数据，已显示本地演示序列（随机，非真实）。",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [source, fredSeriesId, worldbankSeries]);

  const chartHeight = "clamp(22rem, 58vh, 44rem)";

  if (loading || !payload) {
    return (
      <div
        className="flex w-full items-center justify-center text-sm text-slate-500"
        style={{ minHeight: chartHeight }}
      >
        正在加载宏观数据…
      </div>
    );
  }

  const opt = macroPayloadToChartOption(
    {
      categories: payload.categories,
      series: payload.series,
      title: payload.title,
    },
    { compact: false },
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      {payload.attribution ? (
        <p className="shrink-0 text-xs leading-relaxed text-slate-500">{payload.attribution}</p>
      ) : null}
      <div className="w-full min-w-0" style={{ height: chartHeight }}>
        <ReactECharts option={opt} style={{ height: "100%", width: "100%" }} />
      </div>
    </div>
  );
}
