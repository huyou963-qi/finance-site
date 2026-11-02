"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useVisibleFeatures } from "@/hooks/useVisibleFeatures";
import { GICS_SECTOR_DEFS } from "@/lib/equity/gicsCatalog";
import { SITE } from "@/lib/siteTheme";
import type { FinancialBasis, FinancialMember, FinancialMetric, MembershipBasis } from "@/lib/equity/industryFinancials";
import type { IndustryFinancialResponse } from "@/lib/equity/industryFinancialsStore";
import { readIndustryFinancialResponse } from "@/lib/equity/industryFinancialResponse";

const Chart = dynamic(() => import("@/components/equity/IndustryFinancialChart").then(module => module.IndustryFinancialChart), {
  ssr: false, loading: () => <div className="flex h-56 items-center justify-center text-xs text-fs-muted">加载图表…</div>,
});
const control = "min-h-11 w-full min-w-0 rounded-md border border-fs-border bg-fs-bg px-3 text-base text-fs-text outline-none focus-visible:ring-2 focus-visible:ring-fs-accent sm:text-sm";
const amount = (value: number | null) => value == null ? "—" : (value / 1e9).toLocaleString("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (value: number | null, sign = false) => value == null ? "—" : `${sign && value > 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) : "暂无记录";
const statusLabel: Record<FinancialMember["status"], string> = { available: "", partial: "字段待补齐", missing: "该期财务待更新", unmapped: "公司映射待补齐" };
const fieldLabel = { revenue: "营收", netIncome: "净利润", ocf: "经营现金流", capex: "资本开支" };
const memberStatus = (member: FinancialMember) => member.status === "partial" && member.missingFields?.length
  ? `${member.missingFields.map(field => fieldLabel[field]).join("、")}待补齐` : statusLabel[member.status];

function Coverage({ metric }: { metric: FinancialMetric }) {
  return <span className={`text-xs ${metric.weightCoverage != null && metric.weightCoverage < 0.8 ? "text-amber-700" : "text-fs-muted"}`}>
    {metric.sampleCount}/{metric.universeCount} 家 · 股票权重覆盖 {pct(metric.weightCoverage)}
  </span>;
}

export function IndustryFinancialsClient() {
  const params = useSearchParams();
  const features = useVisibleFeatures();
  const [etf, setEtf] = useState(() => GICS_SECTOR_DEFS.find(row => row.etf === params.get("etf"))?.etf ?? "XLK");
  const [quarters, setQuarters] = useState(20);
  const [basis, setBasis] = useState<FinancialBasis>("TTM");
  const [membership, setMembership] = useState<MembershipBasis>("current");
  const [period, setPeriod] = useState<string | null>(null);
  const [data, setData] = useState<IndustryFinancialResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ etf, quarters: String(quarters), membership });
    if (period) query.set("period", period);
    fetch(`/api/equity/industry-financials?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(response => readIndustryFinancialResponse<IndustryFinancialResponse>(response))
      .then(payload => { if (!controller.signal.aborted) setData(payload); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "行业财务加载失败"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [etf, quarters, membership, period, retry]);

  const selectPeriod = useCallback((value: string) => setPeriod(value), []);
  const selectedPeriod = period ?? data?.latestPeriod ?? "";
  const history = data?.history;
  const periods = useMemo(() => history?.map(row => row.period) ?? [], [history]);
  const views = useMemo(() => history?.map(row => row[basis]) ?? [], [history, basis]);
  const view = views.find(row => row.period === selectedPeriod);
  const members = data?.selectedPeriod === selectedPeriod ? data.selected[basis].members : null;
  const index = periods.indexOf(selectedPeriod);
  const selectedDef = GICS_SECTOR_DEFS.find(row => row.etf === etf)!;
  const mode = basis === "TTM" ? "TTM" : "单季";
  const charts = useMemo(() => [
    { title: "营收规模", metric: "revenue" as const, percent: false, series: [{ name: "营收", color: SITE.accent, metrics: views.map(row => row.revenue) }] },
    { title: "净利润规模", metric: "netIncome" as const, percent: false, series: [{ name: "净利润", color: SITE.accent, metrics: views.map(row => row.netIncome) }] },
    { title: "净利率", metric: "netMargin" as const, percent: true, series: [{ name: "净利率", color: SITE.accent, metrics: views.map(row => row.netMargin) }] },
    { title: "现金流与资本开支", metric: "fcf" as const, percent: false, series: [
      { name: "经营现金流", color: SITE.accent, metrics: views.map(row => row.ocf) },
      { name: "资本开支", color: "#a56a17", dashed: true, metrics: views.map(row => row.capex) },
      { name: "自由现金流", color: "#16805b", metrics: views.map(row => row.fcf) },
    ] },
  ], [views]);
  function resetSelection() { setData(null); setPeriod(null); }

  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-3 py-5 sm:px-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs text-fs-muted">美股 / 行业 ETF 财务观察</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-fs-text">美股行业</h1><p className="mt-1 text-sm text-fs-muted">追踪行业营收、盈利能力与现金流的历史变化</p></div>
      <div className="flex min-h-11 items-center gap-3 text-xs text-fs-muted"><span className="rounded bg-fs-accent-soft px-2 py-1 text-fs-accent-text">日批更新</span>{features.can("equity-sectors") ? <Link href="/equity/sectors" className="py-2 text-fs-accent-text hover:underline">美股历史 →</Link> : null}</div>
    </header>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <label className="flex min-w-0 flex-col gap-1 text-xs text-fs-muted">观察行业 / 可交易 ETF<select className={control} value={etf} onChange={event => { resetSelection(); setEtf(event.target.value); }}>{GICS_SECTOR_DEFS.map(row => <option key={row.etf} value={row.etf}>{row.nameZh} · {row.etf}</option>)}</select></label>
      <label className="flex min-w-0 flex-col gap-1 text-xs text-fs-muted">财务口径<select className={control} value={basis} onChange={event => setBasis(event.target.value as FinancialBasis)}><option value="TTM">TTM · 最近四季</option><option value="Q">单季</option></select></label>
      <label className="flex min-w-0 flex-col gap-1 text-xs text-fs-muted">历史区间<select className={control} value={quarters} onChange={event => { resetSelection(); setQuarters(Number(event.target.value)); }}><option value="12">近3年</option><option value="20">近5年</option><option value="40">近10年</option></select></label>
      <label className="flex min-w-0 flex-col gap-1 text-xs text-fs-muted">成分口径<select className={control} value={membership} onChange={event => { resetSelection(); setMembership(event.target.value as MembershipBasis); }}><option value="current">当前 ETF 成分回溯</option><option value="historical">历史季末 ETF 持仓</option></select></label>
    </div>
    <div className="rounded-lg bg-fs-elevated px-4 py-3 text-xs leading-6 text-fs-muted">
      <p><strong className="text-fs-text">{selectedDef.nameZh} · {etf}</strong>{data ? `　跟踪指数：${data.indexName}` : ""}</p>
      <p>{membership === "current" ? `按 ${data?.holdingsDate ?? "待读取"} 的 ETF 股票持仓回溯公司历史；不代表当时行业成分。` : "逐季使用季末前7日内的真实持仓归档；缺少归档的季度留空，不用未来成分替代。"} 财务采用最新重述值，非历史时点回测。</p>
      {data ? <p>财务入库：{dateTime(data.sourceUpdatedAt)}（北京时间） · 公告批次覆盖至美东 {data.batch?.through ?? "暂无记录"}{data.batch && (data.batch.status !== "success" || data.batch.pending || data.batch.failed || data.batch.missingIndexes) ? " · 批次未全量完成" : ""}</p> : null}
    </div>

    {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"><span>{error}</span><button type="button" className="min-h-11 rounded border border-red-300 px-3" onClick={() => setRetry(value => value + 1)}>重试</button></div> : null}
    {loading && !data ? <div role="status" className="py-16 text-center text-sm text-fs-muted">正在读取 ETF 持仓与历史财报…</div> : null}

    {data && view ? <>
      {data.holdingsStale ? <p className="text-xs text-amber-700">最新持仓归档已超过7天，成分及权重可能滞后。</p> : null}
      <section aria-label="选择历史报告期" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><strong className="text-base text-fs-accent-text">{selectedPeriod} · {mode}</strong><span className="ml-2 text-xs text-fs-muted">{view.universeCount} 家发行人 · 成分快照 {view.holdingsDate ?? "缺失"}</span></div><label className="flex items-center gap-2 text-xs text-fs-muted"><span className="shrink-0 whitespace-nowrap">报告期</span><select aria-label="报告期" className={`${control} max-w-40`} value={selectedPeriod} onChange={event => selectPeriod(event.target.value)}>{periods.map(value => <option key={value} value={value}>{value}{value === data.latestPeriod ? " · 最新" : ""}</option>)}</select></label></div>
        <div className="flex items-center gap-3"><span className="text-xs text-fs-muted">{periods[0]}</span><input aria-label="历史季度时间轴" className="min-h-11 min-w-0 flex-1 accent-fs-accent" type="range" min={0} max={Math.max(0, periods.length - 1)} value={Math.max(0, index)} onChange={event => selectPeriod(periods[Number(event.target.value)]!)} /><button type="button" aria-label="上一季度" disabled={index <= 0} onClick={() => selectPeriod(periods[index - 1]!)} className="min-h-11 min-w-11 rounded-md border border-fs-border text-fs-text disabled:opacity-30">←</button><button type="button" aria-label="下一季度" disabled={index >= periods.length - 1} onClick={() => selectPeriod(periods[index + 1]!)} className="min-h-11 min-w-11 rounded-md border border-fs-border text-fs-text disabled:opacity-30">→</button></div>
        <p className="text-xs text-fs-muted">{view.holdingsDate ? "每项指标独立统计有效样本，缺失值不按零处理。" : "该期缺少可靠 ETF 持仓归档，行业数值暂不展示。"}{view.unresolvedCount ? ` ${view.unresolvedCount} 家公司尚未映射，保留在覆盖率分母中。` : ""}</p>
      </section>

      <div className="grid gap-3 sm:grid-cols-3" aria-live="polite">
        <div className="rounded-lg border border-fs-border p-4"><p className="text-sm text-fs-muted">{mode}营收 · 十亿美元</p><p className="my-1 text-3xl font-semibold tabular-nums text-fs-text">{amount(view.revenue.value)}</p><Coverage metric={view.revenue} /><p className="mt-2 text-xs text-fs-muted">同样本同比 {pct(view.revenueYoY.value, true)} · {view.revenueYoY.sampleCount} 家可比</p></div>
        <div className="rounded-lg border border-fs-border p-4"><p className="text-sm text-fs-muted">{mode}净利率</p><p className="my-1 text-3xl font-semibold tabular-nums text-fs-text">{pct(view.netMargin.value)}</p><Coverage metric={view.netMargin} /><p className="mt-2 text-xs text-fs-muted">配对样本净利润合计 / 营收合计</p></div>
        <div className="rounded-lg border border-fs-border p-4"><p className="text-sm text-fs-muted">{mode}自由现金流 · 十亿美元</p><p className="my-1 text-3xl font-semibold tabular-nums text-fs-text">{amount(view.fcf.value)}</p><Coverage metric={view.fcf} /><p className="mt-2 text-xs text-fs-muted">经营现金流减资本开支</p></div>
      </div>

      <section className="border-t border-fs-border pt-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-fs-text">行业主要财务指标的历史变化</h2><span className="text-xs text-fs-muted">空心点：权重覆盖不足80%，不连入趋势线 · 点击图表选择报告期</span></div><div className="mt-4 grid min-w-0 gap-x-8 gap-y-5 md:grid-cols-2">
        {charts.map(chart => <section key={chart.metric} className="min-w-0"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium text-fs-text">{chart.title}</h3><span className="text-sm tabular-nums text-fs-text">{chart.percent ? pct(view[chart.metric].value) : amount(view[chart.metric].value)}</span></div><div className="mt-1 flex flex-wrap justify-between gap-1"><span className="text-xs text-fs-muted">{chart.percent ? "%" : "十亿美元"}</span><Coverage metric={view[chart.metric]} /></div><Chart periods={periods} series={chart.series} selectedPeriod={selectedPeriod} percent={chart.percent} onSelect={selectPeriod} /></section>)}
      </div><p className="mt-3 text-xs leading-6 text-fs-muted">现金流三条线使用经营现金流与资本开支均齐全的共同样本，确保自由现金流 = 经营现金流 − 资本开支。
        {view.cashSourceCoverage ? ` ${mode}单项数据权重覆盖：经营现金流 ${pct(view.cashSourceCoverage.ocf.weightCoverage)}；资本开支 ${pct(view.cashSourceCoverage.capex.weightCoverage)}。单项有值但另一项缺失的公司不计入这三条曲线。` : ""}
      </p></section>

      <section className="border-t border-fs-border pt-5" aria-busy={loading}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-fs-text">行业公司速览</h2><span className="text-xs text-fs-muted">{selectedPeriod} · {mode} · FCF单位：十亿美元</span></div><p className="mt-1 text-xs text-fs-muted">按持仓权重排序；同一公司多股类合并。点击公司进入财务基本面。</p>
        {!members ? <p role="status" className="py-6 text-sm text-fs-muted">正在读取所选季度的公司数据…</p> : !members.length ? <p className="py-6 text-sm text-fs-muted">尚无该期 ETF 股票成分，请等待持仓归档更新。</p> : <>
          <div className="mt-3 hidden grid-cols-[minmax(150px,1.8fr)_repeat(3,minmax(70px,1fr))_80px] gap-3 bg-fs-elevated px-3 py-2 text-xs text-fs-muted sm:grid"><span>公司</span><span>营收同比</span><span>净利率</span><span>自由现金流</span><span>个股研究</span></div>
          {members.map(member => {
            const href = `/equity/stocks/${encodeURIComponent(member.symbol)}?tab=fundamentals`;
            const linked = features.can("markets") && member.status !== "unmapped";
            return <div key={member.symbol} className="grid grid-cols-3 items-center gap-2 border-b border-fs-border px-1 py-3 text-sm sm:grid-cols-[minmax(150px,1.8fr)_repeat(3,minmax(70px,1fr))_80px] sm:gap-3 sm:px-3">
              <div className="col-span-3 min-w-0 sm:col-span-1">{linked ? <Link href={href} className="inline-flex min-h-11 max-w-full items-center gap-2 text-fs-accent-text hover:underline"><strong>{member.symbol}</strong><span className="break-words text-xs">{member.name}</span></Link> : <span className="text-fs-text">{member.symbol} · {member.name}</span>}<p className="text-xs text-fs-muted">{member.fiscalDate ? `财季末 ${member.fiscalDate}` : memberStatus(member)}{member.fiscalDate && memberStatus(member) ? ` · ${memberStatus(member)}` : ""}</p></div>
              <div className="tabular-nums text-fs-text"><span className="block text-xs text-fs-muted sm:hidden">营收同比</span>{pct(member.revenueYoY, true)}</div><div className="tabular-nums text-fs-text"><span className="block text-xs text-fs-muted sm:hidden">净利率</span>{pct(member.netMargin)}</div><div className="tabular-nums text-fs-text"><span className="block text-xs text-fs-muted sm:hidden">自由现金流</span>{amount(member.fcf)}</div>
              <div className="col-span-3 sm:col-span-1">{linked ? <Link href={href} className="inline-flex min-h-11 items-center text-xs text-fs-accent-text hover:underline">基本面 →</Link> : null}</div>
            </div>;
          })}
        </>}
      </section>
      <details className="border-t border-fs-border pt-3 text-xs leading-6 text-fs-muted"><summary className="min-h-11 cursor-pointer py-2 text-fs-accent-text">统计口径与数据说明</summary><p>分类对应11只 Select Sector SPDR ETF。成分来自官方持仓归档，不以证券主档的行业标签替代。公司按 CIK 去重，权重合并；未识别持仓仍计入覆盖分母。</p><p>营收同比采用本期与上年同期都有值的同一批公司；净利率使用营收和净利润同时有效的公司。现金流三条线采用相同子样本。TTM 必须有连续四季，缺季留空。覆盖不足时，数值仅代表已覆盖样本，不能视为完整行业。</p><p>金额为已有 SEC 标准化美元数据，展示单位为十亿美元。自然季度按公司实际财季末归组，不代表所有公司起止日期完全一致。当前重述值不等于当时已知值；历史持仓口径也不是 PIT 财务回测。</p><p>金融及房地产行业的现金流指标可比性有限，未补齐行业专属科目前不据此评价经营优劣。页面只读取数据库，不触发全行业外部抓取；入库后最多约5分钟缓存更新。</p></details>
    </> : null}
  </div>;
}
