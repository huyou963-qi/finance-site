"use client";

import { useEffect, useState } from "react";
import { formatGuidanceValue, GUIDANCE_BASIS_NAMES, GUIDANCE_GROUPS, GUIDANCE_NAMES, type GuidanceSeries, type GuidanceVersion } from "@/lib/equity/managementGuidance";
import type { ManagementGuidancePayload } from "@/lib/equity/managementGuidanceStore";
import { useTr } from "@/i18n/TextProvider";
import { identityTr, type Tr } from "@/i18n/text";

const button = "min-h-9 rounded px-3 py-1.5 text-xs transition-colors";
function Source({ url, children }: { url: string; children: React.ReactNode }) {
  return <a href={url} target="_blank" rel="noopener noreferrer" className="text-fs-accent-text underline underline-offset-2">{children}</a>;
}
function stateLabel(record: GuidanceVersion, today: string, tr: Tr = identityTr) {
  if (record.status === "withdrawn") return tr("已撤回");
  if (record.status === "unparsed") return tr("待确认");
  return record.target.endDate ? record.target.endDate < today ? tr("目标期已结束") : tr("未来目标") : tr("截止日未确认");
}
function changeLabel(series: GuidanceSeries, tr: Tr = identityTr) {
  if (!series.change) return series.history.length === 1 ? tr("首次收录") : tr("查看历史与口径");
  const { delta, kind } = series.change;
  if (delta === 0) return tr("同期间中值维持不变");
  const direction = kind === "absolute" ? tr("变化") : delta > 0 ? tr("上调") : tr("下调");
  return tr("同期间中值{direction} {v1}{v2}", { direction, v1: Math.abs(delta).toFixed(1), v2: kind === "pp" ? tr(" 个百分点") : kind === "percent" ? "%" : "" });
}
function Evidence({ series }: { series: GuidanceSeries }) {
  const tr = useTr();
  return <details className="mt-3 text-xs">
    <summary className="min-h-9 cursor-pointer py-2 text-fs-accent-text">{tr("原文与调整历史（")}{series.history.length}）</summary>
    <ol className="space-y-3 border-l border-fs-border pl-3">
      {series.history.map((record, index) => <li key={`${record.id}:${index}`} className="space-y-1">
        <div className="flex flex-wrap justify-between gap-2"><span>{record.disclosedOn} · {record.dateBasis === "publication" ? tr("公布日期") : tr("申报日期")}</span><span>{record.status === "withdrawn" ? tr("已撤回") : formatGuidanceValue(record.value)}</span></div>
        <blockquote className="break-words rounded bg-fs-bg p-2 text-fs-muted">{record.evidence}</blockquote>
        <Source url={record.sourceUrl}>{tr("查看公告原文")}</Source>
      </li>)}
    </ol>
  </details>;
}

export function StockManagementGuidance({ symbol, compact, onDetails }: { symbol: string; compact: boolean; onDetails: () => void }) {
  const tr = useTr();
  const [data, setData] = useState<ManagementGuidancePayload | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [section, setSection] = useState<"guidance" | "delivery">("guidance");
  const [target, setTarget] = useState("latest");
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(false);
    fetch(`/api/equity/stocks/${encodeURIComponent(symbol)}/guidance`, { cache: "no-store", signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error(); return r.json() as Promise<ManagementGuidancePayload>; })
      .then(setData).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [symbol, retry]);
  const today = data?.asOf.slice(0, 10) ?? "";
  const latestDay = data?.series[0]?.latest.disclosedOn;
  const priority = ["revenue", "grossMargin", "eps", "fcf", "ocf", "capex", "operatingIncome", "operatingExpenses", "netLeverage"];
  const latest = (data?.series ?? []).filter(s => s.latest.disclosedOn === latestDay && s.latest.status === "active" && (!s.latest.target.endDate || s.latest.target.endDate >= today))
    .sort((a, b) => priority.indexOf(a.latest.metric) - priority.indexOf(b.latest.metric) || (a.latest.basis === "gaap" ? -1 : b.latest.basis === "gaap" ? 1 : 0));
  const targets = [...new Map((data?.series ?? []).map(s => [s.latest.target.key, s.latest.target.label])).entries()];
  const filtered = (data?.series ?? []).filter(s => target === "all" || (target === "latest" ? s.latest.disclosedOn === latestDay : s.latest.target.key === target));
  const shown = compact ? latest.filter((s, i) => latest.findIndex(x => x.latest.metric === s.latest.metric) === i).slice(0, 3) : filtered;

  return <section className="min-w-0 rounded-md border border-fs-border bg-fs-elevated/20 p-3" aria-label={tr("管理层指引")}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="text-sm font-medium">{tr("管理层未来指引")}</h3><p className="mt-1 text-xs text-fs-muted">{tr("公司披露的未来目标 · 与已实现业绩及市场一致预期分别展示")}</p></div>
      {compact ? <button type="button" className={`${button} text-fs-accent-text`} onClick={onDetails}>{tr("全部指引与兑现 →")}</button> : null}
    </div>
    {error ? <div className="mt-3 flex items-center gap-3 text-xs text-fs-muted">{tr("暂时无法加载指引")}<button type="button" className={button} onClick={() => setRetry(n => n + 1)}>{tr("重试")}</button></div> : !data ? <p className="mt-3 text-xs text-fs-muted" role="status">{tr("正在加载指引…")}</p> : <>
      {!compact ? <>
        <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label={tr("指引内容")}>
          {([['guidance', tr("指引与历史")], ['delivery', tr("指引兑现")]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={section === id} onClick={() => setSection(id)} className={`${button} ${section === id ? "bg-fs-accent/20 text-fs-accent-text" : "text-fs-muted"}`}>{label}</button>)}
        </div>
        {section === "guidance" ? <label className="mt-3 flex flex-wrap items-center gap-2 text-xs">{tr("目标财期")}<select aria-label={tr("目标财期")} value={target} onChange={e => setTarget(e.target.value)} className="min-h-9 max-w-full rounded border border-fs-border bg-fs-bg px-2 py-1.5">
            <option value="latest">{tr("最近一次披露")}</option><option value="all">{tr("全部历史期间")}</option>{targets.map(([key, label]) => <option key={key} value={key}>{tr(label)}</option>)}
          </select>
        </label> : null}
      </> : null}
      {compact || section === "guidance" ? <>
        {shown.length ? <div className={`mt-3 grid min-w-0 gap-3 ${compact ? "md:grid-cols-3" : "lg:grid-cols-2"}`}>
          {shown.map(series => {
            const record = series.latest;
            return <article key={`${record.id}:${record.metric}:${record.basis}`} className="min-w-0 rounded border border-fs-border/60 p-3">
              <div className="flex flex-wrap justify-between gap-1 text-xs"><span>{tr(GUIDANCE_GROUPS[record.metric])}</span><span className="text-fs-muted">{stateLabel(record, today, tr)}</span></div>
              <h4 className="mt-2 text-sm">{tr(GUIDANCE_NAMES[record.metric])} · {tr(GUIDANCE_BASIS_NAMES[record.basis])}</h4>
              <p className="mt-1 text-xs text-fs-muted">{tr(record.target.label)}{record.target.endDate ? tr(" · 截止 {endDate}", { endDate: record.target.endDate }) : ""}</p>
              <p className="mt-2 break-words text-lg font-medium tabular-nums">{record.status === "withdrawn" ? tr("已撤回指引") : formatGuidanceValue(record.value)}</p>
              {record.value ? <p className="text-xs text-fs-muted">{record.value.unit === "USD/share" ? tr("USD / 股") : record.value.unit === "USD" ? tr("USD；B = 十亿，M = 百万") : record.value.unit === "percent" ? tr("百分比") : tr("倍数")}</p> : null}
              <p className="mt-2 text-xs">{changeLabel(series, tr)}</p>
              <p className="mt-1 text-xs text-fs-muted">{record.disclosedOn} · {record.dateBasis === "publication" ? tr("公布") : tr("申报")}</p>
              {record.basis === "company" ? <p className="mt-1 text-xs text-fs-muted">{tr("按公司定义理解；具体范围见原文。")}</p> : null}
              <Evidence series={series} />
            </article>;
          })}
        </div> : <p className="mt-3 text-xs text-fs-muted">{compact && data.series.length ? tr("最近一次披露暂无可确认的未来数值指引，可查看全部指引与原文。") : tr("当前收录公告中尚未识别到该范围的指引，不代表公司未提供指引。")}</p>}
      </> : <div className="mt-3 space-y-3" aria-live="polite">
        <p className="text-xs text-fs-muted">{tr("使用目标期结束前最后一次可确认的指引，对照最早可核验财报值；仅匹配相同截止日、期间和口径。")}</p>
        {data.delivery.length ? data.delivery.map((item, i) => <article key={`${item.guidance.id}:${i}`} className="rounded border border-fs-border/60 p-3 text-xs">
          <div className="flex flex-wrap justify-between gap-2"><h4 className="font-medium">{tr(GUIDANCE_NAMES[item.guidance.metric])} · {tr(GUIDANCE_BASIS_NAMES[item.guidance.basis])}</h4><span>{tr(item.guidance.target.label)}</span></div>
          <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3"><div><dt className="text-fs-muted">{tr("当时指引 ·")} {item.guidance.disclosedOn}</dt><dd className="mt-1 tabular-nums">{formatGuidanceValue(item.guidance.value)}</dd></div><div><dt className="text-fs-muted">{tr("实际结果 ·")} {item.actual.reportedOn}</dt><dd className="mt-1 tabular-nums">{formatGuidanceValue({ low: null, high: null, point: item.actual.value, qualifier: "point", unit: item.actual.unit })}</dd></div><div><dt className="text-fs-muted">{tr("对照结果")}</dt><dd className="mt-1">{{ above: tr("超过区间上限"), below: tr("低于区间下限"), within: tr("落在区间内"), met: tr("达到目标"), missed: tr("未达目标"), point: tr("点值对照，原文未给区间") }[item.outcome]}</dd></div></dl>
          <div className="mt-2 flex gap-4"><Source url={item.guidance.sourceUrl}>{tr("指引原文")}</Source><Source url={item.actual.sourceUrl}>{tr("实际财报")}</Source></div>
        </article>) : <p className="text-xs text-fs-muted">{tr("暂无符合对照条件的记录。目标截止日未明确、口径不同、已撤回或实际财报未齐的指引暂不评分；全年及公司自定义指标保留原文核对。")}</p>}
      </div>}
      {!compact ? <p className="mt-3 text-xs text-fs-muted">{tr("已检查")} {data.coverage.announcements} {tr("份公告，")}{data.coverage.withAttachments} {tr("份有附件记录。")}{data.coverage.truncated ? tr("历史展示范围为最近 200 份公告。") : ""}{tr("上下限按原文保留；资本开支增加不直接判为利好。")}</p> : null}
    </>}
  </section>;
}
