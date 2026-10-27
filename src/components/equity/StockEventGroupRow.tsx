import type { StockEvent } from "@/lib/equity/stockEvents";
import type { StockEventGroup } from "@/lib/equity/stockEventGroups";
import { BasicEarningsBriefView } from "./BasicEarningsBriefView";

function beijingTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}
function statusText(status: string | null) {
  return status === "complete" ? "标准化财务已更新" : status === "error" ? "财务更新失败，后续批次重试"
    : status === "pending" ? "完整财务数据待补齐" : "财务更新状态待核验";
}
function pct(value: number | null) {
  return value == null ? "—" : `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}
function pctColor(value: number | null) {
  return value == null ? "text-fs-muted" : value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-fs-muted";
}
const sessionName = { "before-open": "盘前", regular: "盘中", "after-close": "盘后", closed: "休市期间", unknown: "时段待确认" };
function easternTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", { timeZone: "America/New_York", hour12: false });
}

function Metrics({ event }: { event: StockEvent }) {
  const metrics = event.metrics;
  if (!metrics) return null;
  const revenue = metrics.revenue == null ? "—" : Math.abs(metrics.revenue) >= 1e9
    ? `${(metrics.revenue / 1e9).toFixed(1)}B` : `${(metrics.revenue / 1e6).toFixed(0)}M`;
  return <span className="flex flex-wrap items-baseline gap-2 text-xs">
    <span className="text-fs-text">营收 {revenue}</span>
    <span className={pctColor(metrics.revenueYoY)}>{pct(metrics.revenueYoY)}</span>
    {metrics.eps != null ? <span className="text-fs-text">GAAP EPS {metrics.eps.toFixed(2)}
      <span className={`ml-1 ${pctColor(metrics.epsYoY)}`}>{pct(metrics.epsYoY)}</span>
    </span> : null}
  </span>;
}

function EventRow({ event, grouped }: { event: StockEvent; grouped: boolean }) {
  const disclosure = event.disclosure;
  const periodic = event.type === "earnings" || event.type === "annual";
  const badge = event.type === "insider-plan" ? "10b5-1" : event.type === "split" ? "拆股"
    : event.type === "8k" && event.items.length ? `${event.form ?? "8-K"} ${event.items.join(",")}` : event.form;
  const badgeStyle = event.type === "earnings" ? "bg-blue-500/15 text-blue-400"
    : event.type === "annual" ? "bg-indigo-500/20 text-indigo-400" : event.type === "split" ? "bg-purple-500/15 text-purple-400"
      : event.importance === "high" ? "bg-amber-500/15 text-amber-800" : "bg-fs-elevated text-fs-muted";
  return <li className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 rounded px-2 py-1.5 hover:bg-fs-elevated/40">
    <span className="w-20 shrink-0 tabular-nums text-xs text-fs-muted">{event.date}</span>
    {event.timing ? <span className="text-[10px] text-fs-muted">
      {event.timing.displayBasis === "company-publication" ? event.timing.publishedAt ? `公司发布 · ${sessionName[event.timing.session]}` : "公司原文日期 · 时刻/时区未披露"
        : event.timing.displayBasis === "sec-acceptance" ? `SEC 接收 · ${sessionName[event.timing.acceptedSession]}` : "SEC 申报日期"}
    </span> : null}
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badgeStyle}`}>{badge}</span>
    {event.url ? <a href={event.url} target="_blank" rel="noopener noreferrer" className="min-w-0 break-words text-sm text-fs-text hover:text-fs-accent-text hover:underline">
      {event.titleZh} ↗
    </a> : <span className="min-w-0 break-words text-sm text-fs-text">{event.titleZh}</span>}
    {!grouped ? <Metrics event={event} /> : null}
    {event.reactionDetails ? <span className="text-xs text-fs-muted">{event.reactionDetails.label}
      {event.reaction != null ? <span className={`ml-1 ${pctColor(event.reaction)}`}>{pct(event.reaction)}</span> : null}
    </span> : null}
    {disclosure ? <div className="w-full min-w-0 space-y-1 text-xs leading-6 sm:pl-24">
      <details className="text-fs-muted">
        <summary className="w-fit cursor-pointer text-fs-accent-text">更新详情</summary>
        <div className="flex flex-wrap gap-x-3">
          <span>入库：{beijingTime(disclosure.collectedAt)}（北京）</span>
          {periodic ? <>
            <span>{statusText(disclosure.status)}</span>
            {disclosure.processedAt ? <span>{disclosure.status === "complete" ? "完成" : "检查"}：{beijingTime(disclosure.processedAt)}（北京）</span> : null}
          </> : null}
          {disclosure.periodEnd ? <span>关联报告期末：{disclosure.periodEnd}</span> : null}
          {event.timing ? <>
            <span>SEC 申报日期：{event.timing.filedDate}</span>
            {event.timing.acceptedAt ? <a href={event.timing.acceptedAtSource ?? event.url ?? undefined} target="_blank" rel="noopener noreferrer" className="text-fs-accent-text hover:underline">
              SEC 接收：美东 {easternTime(event.timing.acceptedAt)}（{sessionName[event.timing.acceptedSession]}）↗
            </a> : <span>SEC 精确接收时刻待核验。</span>}
            {event.timing.publishedAt ? <a href={event.timing.publicationSource ?? undefined} target="_blank" rel="noopener noreferrer" className="text-fs-accent-text hover:underline">
              公司发布：美东 {easternTime(event.timing.publishedAt)}（{sessionName[event.timing.session]}）↗
            </a> : <span>{event.timing.publishedOn ? `公司原文发布日期：${event.timing.publishedOn}，时刻与时区未披露，不据此计算市场反应。` : "当前来源未核实公司精确发布时刻，不以 SEC 接收时刻代替。"}</span>}
          </> : null}
          {event.reactionDetails?.baselineDate && event.reactionDetails.targetDate ? <span>
            收盘收益窗口：{event.reactionDetails.baselineDate} → {event.reactionDetails.targetDate}（复权收盘）；仅描述该窗口，不表示公告的因果影响。
          </span> : null}
        </div>
      </details>
      {!grouped ? <BasicEarningsBriefView brief={event.brief} /> : null}
      {disclosure.attachments.map(attachment => <details key={attachment.url} className="min-w-0 rounded border border-fs-border px-2">
        <summary className="cursor-pointer break-all text-fs-accent-text">公告附件 · {attachment.filename}</summary>
        <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="text-fs-accent-text hover:underline">查看 SEC 附件原文 ↗</a>
        <p className="max-h-64 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere] text-fs-muted">{attachment.text || "此附件暂无可展示文本，请查看原文。"}</p>
        <p className="text-fs-muted">原文摘录，最多展示 20,000 字符；财务口径以正式报告为准。</p>
      </details>)}
    </div> : null}
  </li>;
}

export function StockEventGroupRow({ group }: { group: StockEventGroup }) {
  if (group.events.length === 1) return <EventRow event={group.events[0]} grouped={false} />;
  const primary = group.events.find(event => (event.type === "earnings" || event.type === "annual") && !event.form?.endsWith("/A") && event.metrics)
    ?? group.events.find(event => event.metrics);
  const narrativeBrief = group.events.find(event => event.type === "8k" && event.brief)?.brief;
  const financialBrief = group.events.find(event => (event.type === "earnings" || event.type === "annual") && event.brief?.financial.length)?.brief;
  const groupBrief = narrativeBrief ? { ...narrativeBrief, financial: financialBrief?.financial ?? narrativeBrief.financial,
    financialFiledAt: financialBrief?.financialFiledAt ?? narrativeBrief.financialFiledAt } : financialBrief ?? primary?.brief;
  return <li className="min-w-0 rounded-md border border-fs-border/70 bg-fs-elevated/20 p-2">
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-2 py-1">
      <span className="text-sm font-medium text-fs-text">业绩披露 · 报告期截至 {group.periodEnd}</span>
      <span className="text-xs text-fs-muted">{group.events.length} 份关联公告</span>
      {primary ? <Metrics event={primary} /> : null}
    </div>
    <BasicEarningsBriefView brief={groupBrief} />
    <ul className="min-w-0">{group.events.map((event, index) => <EventRow key={event.disclosure?.accession ?? `${event.date}-${index}`} event={event} grouped />)}</ul>
  </li>;
}
