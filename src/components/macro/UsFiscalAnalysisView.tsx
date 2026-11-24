"use client";
import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type {
  UsFiscalViewId,
  UsFiscalViewsPayload,
} from "@/lib/data/usFiscalViewTypes";
import { CHART } from "@/lib/siteTheme";
import { useTr } from "@/i18n/TextProvider";

let shared:
  | { expires: number; promise: Promise<UsFiscalViewsPayload> }
  | undefined;
function request() {
  if (shared && shared.expires > Date.now()) return shared.promise;
  const promise = fetch("/api/data/us-fiscal-views")
    .then(async (response) => {
      if (!response.ok) throw new Error("财政图表暂不可用，请稍后重试");
      return response.json() as Promise<UsFiscalViewsPayload>;
    })
    .catch((error) => {
      shared = undefined;
      throw error;
    });
  shared = { expires: Date.now() + 30 * 60000, promise };
  return promise;
}
const number = (value: number) =>
  value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
export function UsFiscalAnalysisView({ viewId }: { viewId: UsFiscalViewId }) {
  const tr = useTr();
  const [payload, setPayload] = useState<UsFiscalViewsPayload | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    request()
      .then((data) => {
        if (active) setPayload(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  const view = payload?.views[viewId];
  const option = useMemo<EChartsOption | null>(
    () =>
      view
        ? {
            animation: false,
            textStyle: { color: CHART.text, fontSize: 11 },
            tooltip: {
              trigger: "axis",
              confine: true,
              valueFormatter: (value) =>
                value == null ? "N/A" : number(Number(value)),
            },
            legend: { show: false },
            grid: {
              left: 8,
              right: 8,
              top: 30,
              bottom: 54,
              containLabel: true,
            },
            xAxis: {
              type: "category",
              data: view.categories,
              axisLabel: {
                color: CHART.muted,
                fontSize: 10,
                hideOverlap: true,
              },
              axisLine: { lineStyle: { color: CHART.grid } },
            },
            yAxis: [
              {
                type: "value",
                name: view.unit,
                nameTextStyle: { color: CHART.muted, fontSize: 10 },
                axisLabel: {
                  formatter: (v: number) => number(v),
                  fontSize: 10,
                },
                splitLine: { lineStyle: { color: CHART.grid } },
              },
              ...(view.rightUnit
                ? [
                    {
                      type: "value" as const,
                      name: view.rightUnit,
                      nameTextStyle: { color: CHART.muted, fontSize: 10 },
                      axisLabel: { fontSize: 10 },
                      splitLine: { show: false },
                    },
                  ]
                : []),
            ],
            dataZoom:
              view.id === "B4" || view.id === "C4"
                ? []
                : [
                    {
                      type: "slider",
                      height: 15,
                      bottom: 5,
                      start: Math.max(
                        0,
                        100 -
                          (100 *
                            (view.id === "A1" || view.id === "A4" ? 800 : 60)) /
                            Math.max(1, view.categories.length),
                      ),
                      end: 100,
                    },
                    { type: "inside" },
                  ],
            series: view.series.map((s) => ({
              name: s.name,
              data: s.data,
              type: s.type,
              stack: s.stack,
              yAxisIndex: s.right ? 1 : 0,
              itemStyle: { color: s.color },
              lineStyle: {
                color: s.color,
                type: s.dashed ? "dashed" : "solid",
                width: 1.7,
              },
              showSymbol: view.id === "B4",
              symbolSize: 5,
              connectNulls: false,
              barMaxWidth: 16,
            })),
          }
        : null,
    [view],
  );
  if (error)
    return (
      <div className="p-4 text-sm text-fs-muted" role="alert">
        {tr(error)}
        <button
          className="ml-2 text-fs-accent"
          onClick={() => {
            shared = undefined;
            setRetry((n) => n + 1);
          }}
        >
          {tr("重试")}
        </button>
      </div>
    );
  if (payload && !view)
    return (
      <div className="p-4 text-sm text-fs-muted" role="alert">
        {tr("未配置有效的财政分析图")}
      </div>
    );
  if (!view || !option)
    return (
      <div className="p-4 text-sm text-fs-muted" role="status">
        {tr("正在读取财政图表…")}
      </div>
    );
  return (
    <section className="min-w-0 space-y-2" aria-label={view.title}>
      <h3 className="text-sm font-semibold text-fs-text">{view.title}</h3>
      <div className="text-[11px] text-fs-muted">
        {tr("数据截至")} {view.asOf} · {view.unit}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {view.series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ background: s.color }}
            />
            {s.name}
            {s.right ? tr("（右轴）") : ""}
          </span>
        ))}
      </div>
      <ReactECharts
        option={option}
        notMerge
        lazyUpdate
        style={{ height: 270, width: "100%" }}
      />
      <p className="text-[11px] leading-relaxed text-fs-muted">{view.note}</p>
      <details className="text-xs">
        <summary className="cursor-pointer py-1 text-fs-accent">
          {tr("查看数据表")}
        </summary>
        <div className="max-h-72 overflow-auto">
          <table className="w-full border-collapse text-right tabular-nums">
            <thead>
              <tr>
                {view.table.columns.map((c) => (
                  <th
                    key={c}
                    className="whitespace-nowrap border-b border-fs-border px-2 py-2 font-medium"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td
                      key={j}
                      className="whitespace-nowrap border-b border-fs-border/60 px-2 py-1.5"
                    >
                      {typeof v === "number" ? number(v) : (v ?? "N/A")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <div className="text-[10px] text-fs-muted">{payload?.attribution}</div>
    </section>
  );
}
